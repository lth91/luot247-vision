// Giám sát pipeline AI crawl (cron 6h). Im lặng khi khỏe — chỉ bắn Telegram khi:
//   1. Crawler im ắng: không có tin AI mới >2h trong khung 6h-23h VN.
//   2. Backlog: hàng đợi pending vượt ngưỡng (nhân viên duyệt không kịp).
//   3. Chi phí: llm_usage_log của crawl-news hôm nay (giờ VN) vượt trần.
// Kèm dòng info nguồn đang bị auto-disable nếu có cảnh báo.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { sendTelegram } from "../_shared/telegram.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const QUIET_HOURS_MS = 2 * 3600 * 1000;
const BACKLOG_ALERT = 1500;
const COST_ALERT_USD = 20;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
  const tgToken = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
  const tgChatId = Deno.env.get("TELEGRAM_CHAT_ID") ?? "";

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
  const { data: costRows } = await supabase
    .from("llm_usage_log")
    .select("cost_usd")
    .eq("function_name", "crawl-news")
    .gte("created_at", vnDayStartUtc.toISOString());
  const costToday = (costRows ?? []).reduce((a: number, r: { cost_usd: number }) => a + Number(r.cost_usd || 0), 0);
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
