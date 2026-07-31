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

// Cộng cost TẤT CẢ function theo từng function trong [fromIso, toIso) — dùng
// cho bản tin sáng gộp (30/07: gộp tin 8h05 vào đây, anh Long muốn 1 tin duy nhất).
async function sumCostsByFn(
  supabase: ReturnType<typeof createClient>,
  fromIso: string,
  toIso: string,
): Promise<{ total: number; byFn: Record<string, number> }> {
  const PAGE = 1000;
  const byFn: Record<string, number> = {};
  let total = 0;
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase.from("llm_usage_log")
      .select("function_name, cost_usd")
      .gte("created_at", fromIso).lt("created_at", toIso)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    for (const r of (data ?? []) as { function_name: string; cost_usd: number }[]) {
      const c = Number(r.cost_usd || 0);
      total += c;
      byFn[r.function_name] = (byFn[r.function_name] ?? 0) + c;
    }
    if (!data || data.length < PAGE) break;
  }
  return { total, byFn };
}

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
    // Tiền: TỔNG tất cả function (gộp báo cáo 8h05 cũ vào đây) + so TB 7 ngày.
    const { total: costAllY, byFn } = await sumCostsByFn(supabase, yStartUtc.toISOString(), todayStartUtc.toISOString());
    const week = await sumCostsByFn(supabase, new Date(yStartUtc.getTime() - 6 * 86400000).toISOString(), todayStartUtc.toISOString());
    const avg7 = week.total / 7;
    const pct7 = avg7 > 0 ? Math.round(((costAllY - avg7) / avg7) * 100) : 0;
    const { count: pendingNow } = await supabase.from("news")
      .select("*", { count: "exact", head: true })
      .eq("review_status", "pending");

    // Hybrid: local gánh bao nhiêu việc thật hôm qua (chưa bật/0 → ẩn dòng).
    // Gồm giám khảo (đợt 1) + lô phân loại bulk (đợt 2, 31/07).
    let localLine = "";
    try {
      const baseQ = (task: string) => supabase.from("llm_shadow_queue")
        .select("*", { count: "exact", head: true })
        .eq("task", task)
        .gte("created_at", yStartUtc.toISOString()).lt("created_at", todayStartUtc.toISOString());
      const { count: judgeLocal } = await baseQ("giam_khao_live").in("status", ["done", "finalized"]).neq("model", "haiku-fallback");
      const { count: judgeFb } = await baseQ("giam_khao_live").eq("model", "haiku-fallback");
      const { count: batchLocal } = await baseQ("phan_loai_lo").in("status", ["done", "finalized"]).neq("model", "haiku-fallback");
      const { count: batchFb } = await baseQ("phan_loai_lo").eq("model", "haiku-fallback");
      const totalFb = (judgeFb ?? 0) + (batchFb ?? 0);
      // Đơn giá Haiku tránh được: giám khảo ~$0.0055/cú, lô bulk ~$0.0067/lô.
      const saved = (judgeLocal ?? 0) * 0.0055 + (batchLocal ?? 0) * 0.0067;
      if ((judgeLocal ?? 0) + (batchLocal ?? 0) + totalFb > 0) {
        localLine = `🖥 Local chấm: *${judgeLocal ?? 0}* cú giám khảo`
          + ((batchLocal ?? 0) + (batchFb ?? 0) > 0 ? ` + *${batchLocal ?? 0}* lô bulk` : "")
          + ` (Haiku thay: ${totalFb}) — tiết kiệm ~$${saved.toFixed(2)}`;
      }
    } catch { /* bảng chưa tạo */ }

    const digest = [
      `☀️ *Bản tin sáng — tin tự động luot247* (hôm qua ${label})`,
      ``,
      `💰 Chi phí AI (tất cả): *$${costAllY.toFixed(2)}* (~${Math.round(costAllY * 25.5).toLocaleString("vi-VN")}k đ) — ${pct7 <= 0 ? "📉" : "📈"} ${pct7 > 0 ? "+" : ""}${pct7}% so TB 7 ngày`,
      `      crawl $${(byFn["crawl-news"] ?? 0).toFixed(2)} · bulk $${(byFn["submit-news-bulk"] ?? 0).toFixed(2)} · gửi lẻ $${(byFn["submit-news"] ?? 0).toFixed(2)}`,
      `📥 Vào hàng đợi: *${queued ?? 0}* tin`,
      `✅ Nhân viên duyệt đăng: *${approved ?? 0}* — 🗑 loại: *${rejectedByStaff ?? 0}*`,
      `🤖 AI tự chặn (rác/trùng/kém): *${aiBlocked ?? 0}* bài`,
      ...(localLine ? [localLine] : []),
      `📌 Tồn hàng đợi lúc này: *${pendingNow ?? 0}* tin`,
    ].join("\n");
    if (tgToken && tgChatId) await sendTelegram(tgToken, tgChatId, digest);
    return new Response(JSON.stringify({ ok: true, digest: true, costAllY: costAllY.toFixed(2), queued, approved, rejectedByStaff, aiBlocked, pendingNow }), {
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

  // 4) Hybrid: worker local mất nhịp tim / backlog dồn (chỉ khi công tắc BẬT).
  // Mac vắng thì crawl-finalize đã tự fallback Haiku — chuông này để anh Long
  // biết đang tốn tiền cloud thay vì tưởng local vẫn gánh.
  try {
    const { data: cfg } = await supabase.from("hybrid_config")
      .select("enabled").eq("key", "crawl_giam_khao").maybeSingle();
    if (cfg?.enabled === true) {
      const { data: hb } = await supabase.from("local_worker_status")
        .select("last_seen").order("last_seen", { ascending: false }).limit(1);
      const lastSeen = hb?.[0]?.last_seen ? new Date(hb[0].last_seen).getTime() : 0;
      if (Date.now() - lastSeen > 30 * 60 * 1000) {
        const m = lastSeen ? Math.round((Date.now() - lastSeen) / 60000) : -1;
        sections.push(`🖥 Worker local mất nhịp tim ${m >= 0 ? `*${m} phút*` : "(chưa từng thấy)"} — giám khảo đang chạy fallback Haiku (tốn tiền cloud). Kiểm tra MacBook: sạc/sleep/worker.`);
      }
      const { count: liveBacklog } = await supabase.from("llm_shadow_queue")
        .select("*", { count: "exact", head: true })
        .eq("task", "giam_khao_live").in("status", ["pending", "processing"]);
      if ((liveBacklog ?? 0) > 120) {
        sections.push(`🐌 Hàng chờ giám khảo local đang *${liveBacklog}* job — worker chấm không kịp, tin vào hàng đợi chậm.`);
      }
    }
  } catch { /* bảng hybrid chưa tạo → bỏ qua */ }

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
