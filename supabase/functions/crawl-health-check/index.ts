// Giám sát pipeline AI crawl (cron 6h). Im lặng khi khỏe — chỉ bắn Telegram khi:
//   1. Crawler im ắng: không có tin AI mới >1h trong khung 6h-23h VN
//      (siết 2h→1h ngày 22/07 theo nhịp quét 15 phút).
//   2. Backlog: hàng đợi pending vượt ngưỡng (nhân viên duyệt không kịp).
//   3. Chi phí: llm_usage_log của crawl-news hôm nay (giờ VN) vượt trần.
// Kèm dòng info nguồn đang bị auto-disable nếu có cảnh báo.
//
// MODE daily_digest (cron 8h sáng VN, 22/07): LUÔN gửi bản tin sáng —
// chi phí AI hôm qua + phễu tin hôm qua + tồn hàng đợi. Yêu cầu anh Long:
// nhìn thấy tiền mỗi sáng, khỏi chạy SQL.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { sendTelegram } from "../_shared/telegram.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const QUIET_HOURS_MS = 1 * 3600 * 1000; // nhịp quét 15' → im 1h là bất thường
const BACKLOG_ALERT = 1500;
const COST_ALERT_USD = 20;

// Cộng cost_usd của crawl-news trong [fromIso, toIso). PHẢI phân trang: PostgREST
// cắt 1000 dòng/lần, ngày crawl gọi ~1.300-1.500 cú → select thẳng đếm THIẾU
// (bug 23/07: bản tin sáng báo $5.35 trong khi 17h hôm đó đã $5.91).
async function sumCrawlCost(
  supabase: ReturnType<typeof createClient>,
  fromIso: string,
  toIso?: string,
): Promise<number> {
  const PAGE = 1000;
  let total = 0;
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from("llm_usage_log")
      .select("cost_usd")
      .eq("function_name", "crawl-news")
      .gte("created_at", fromIso)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (toIso) q = q.lt("created_at", toIso);
    const { data } = await q;
    for (const r of data ?? []) total += Number((r as { cost_usd: number }).cost_usd || 0);
    if (!data || data.length < PAGE) break;
  }
  return total;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
  const tgToken = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
  const tgChatId = Deno.env.get("TELEGRAM_CHAT_ID") ?? "";

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* cron 6h gọi không body */ }

  // ===== MODE: daily_digest — bản tin sáng, LUÔN gửi =====
  if (body?.mode === "daily_digest") {
    const vnNow0 = new Date(Date.now() + 7 * 3600 * 1000);
    const todayStartUtc = new Date(Date.UTC(vnNow0.getUTCFullYear(), vnNow0.getUTCMonth(), vnNow0.getUTCDate()) - 7 * 3600 * 1000);
    const yStartUtc = new Date(todayStartUtc.getTime() - 24 * 3600 * 1000);
    const dayVN = new Date(yStartUtc.getTime() + 7 * 3600 * 1000);
    const label = `${String(dayVN.getUTCDate()).padStart(2, "0")}/${String(dayVN.getUTCMonth() + 1).padStart(2, "0")}`;

    const { count: queued } = await supabase.from("news")
      .select("*", { count: "exact", head: true })
      .is("submitted_by", null)
      .gte("created_at", yStartUtc.toISOString()).lt("created_at", todayStartUtc.toISOString());
    const { count: approved } = await supabase.from("review_log")
      .select("*", { count: "exact", head: true })
      .neq("action", "reject")
      .gte("created_at", yStartUtc.toISOString()).lt("created_at", todayStartUtc.toISOString());
    const { count: rejectedByStaff } = await supabase.from("review_log")
      .select("*", { count: "exact", head: true })
      .eq("action", "reject")
      .gte("created_at", yStartUtc.toISOString()).lt("created_at", todayStartUtc.toISOString());
    const { count: aiBlocked } = await supabase.from("crawl_reject_log")
      .select("*", { count: "exact", head: true })
      .neq("stage", "duyet")
      .gte("created_at", yStartUtc.toISOString()).lt("created_at", todayStartUtc.toISOString());
    const costY = await sumCrawlCost(supabase, yStartUtc.toISOString(), todayStartUtc.toISOString());
    const { count: pendingNow } = await supabase.from("news")
      .select("*", { count: "exact", head: true })
      .eq("review_status", "pending");

    const digest = [
      `☀️ *Bản tin sáng — tin tự động luot247* (hôm qua ${label})`,
      ``,
      `💰 Chi phí AI: *$${costY.toFixed(2)}* (~${Math.round(costY * 25.5).toLocaleString("vi-VN")}k đ)`,
      `📥 Vào hàng đợi: *${queued ?? 0}* tin`,
      `✅ Nhân viên duyệt đăng: *${approved ?? 0}* — 🗑 loại: *${rejectedByStaff ?? 0}*`,
      `🤖 AI tự chặn (rác/trùng/kém): *${aiBlocked ?? 0}* bài`,
      `📌 Tồn hàng đợi lúc này: *${pendingNow ?? 0}* tin`,
    ].join("\n");
    if (tgToken && tgChatId) await sendTelegram(tgToken, tgChatId, digest);
    return new Response(JSON.stringify({ ok: true, digest: true, costY: costY.toFixed(2), queued, approved, rejectedByStaff, aiBlocked, pendingNow }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sections: string[] = [];

  // 1) Crawler im ắng (chỉ xét khung 6h-23h VN — đêm báo ít là bình thường)
  const vnHour = (new Date().getUTCHours() + 7) % 24;
  const { data: lastRows } = await supabase
    .from("news")
    .select("created_at")
    .is("submitted_by", null)
    .not("review_status", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);
  const lastAt = lastRows?.[0]?.created_at ? new Date(lastRows[0].created_at).getTime() : 0;
  if (vnHour >= 6 && vnHour <= 23 && lastAt > 0 && Date.now() - lastAt > QUIET_HOURS_MS) {
    const hours = ((Date.now() - lastAt) / 3600000).toFixed(1);
    sections.push(`📉 Crawler im ắng: tin AI mới nhất cách đây *${hours}h* (ngưỡng 2h). Kiểm tra cron crawl-news + edge logs.`);
  }

  // 2) Backlog hàng đợi
  const { count: pending } = await supabase
    .from("news")
    .select("*", { count: "exact", head: true })
    .eq("review_status", "pending");
  if ((pending ?? 0) > BACKLOG_ALERT) {
    sections.push(`🗂 Hàng đợi duyệt đang *${pending}* tin (ngưỡng ${BACKLOG_ALERT}) — nhân viên duyệt không kịp hoặc quên duyệt.`);
  }

  // 3) Chi phí hôm nay (giờ VN)
  const vnNow = new Date(Date.now() + 7 * 3600 * 1000);
  const vnDayStartUtc = new Date(Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth(), vnNow.getUTCDate()) - 7 * 3600 * 1000);
  const costToday = await sumCrawlCost(supabase, vnDayStartUtc.toISOString());
  if (costToday > COST_ALERT_USD) {
    sections.push(`💸 Chi phí crawl-news hôm nay đã *$${costToday.toFixed(2)}* (trần cảnh báo $${COST_ALERT_USD}) — kiểm tra vòng lặp/nguồn lạ.`);
  }

  if (sections.length > 0) {
    const { data: deadSources } = await supabase
      .from("crawl_sources")
      .select("name")
      .eq("is_active", false)
      .gte("consecutive_failures", 10);
    if (deadSources && deadSources.length > 0) {
      sections.push(`🛑 Nguồn đang tự tạm dừng: ${deadSources.map((s: { name: string }) => s.name).join(", ")}`);
    }
    const msg = `🚨 *Pipeline AI crawl — luot247.com*\n\n${sections.join("\n\n")}`;
    if (tgToken && tgChatId) await sendTelegram(tgToken, tgChatId, msg);
    return new Response(JSON.stringify({ ok: true, alerted: true, pending, costToday }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, alerted: false, pending, costToday: costToday.toFixed(2) }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
