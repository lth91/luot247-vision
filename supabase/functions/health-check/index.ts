// Health check chạy mỗi 4 giờ.
// Nếu trong 6h qua, electricity_news có < HEALTHY_THRESHOLD bài mới
// → gửi alert Telegram. Im lặng nếu OK (không spam).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HEALTHY_THRESHOLD = 5;       // số bài tối thiểu trong 6h gần nhất
const WINDOW_HOURS = 6;

async function sendTelegram(token: string, chatId: string, text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const tgToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const tgChatId = Deno.env.get("TELEGRAM_CHAT_ID");

  if (!tgToken || !tgChatId) {
    return new Response(
      JSON.stringify({ error: "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID secret missing" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Test mode: ?test=1 → always send a confirmation message (verify Telegram path).
  const url = new URL(req.url);
  if (url.searchParams.get("test") === "1") {
    await sendTelegram(tgToken, tgChatId,
      `✅ *luot247 health-check test*\nBot hoạt động. Anh sẽ chỉ nhận tin khi có sự cố thật.`);
    return new Response(JSON.stringify({ ok: true, test: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const since = new Date(Date.now() - WINDOW_HOURS * 3600 * 1000).toISOString();

  // 1. Count articles in last 6h
  const { count: recentCount, error: countErr } = await supabase
    .from("electricity_news")
    .select("*", { count: "exact", head: true })
    .gt("crawled_at", since);

  if (countErr) {
    await sendTelegram(tgToken, tgChatId,
      `🚨 *luot247 health-check FAILED*\nDB query error: ${countErr.message}`);
    return new Response(JSON.stringify({ ok: false, error: countErr.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // 2. Count last cron failures
  const { data: cronFails } = await supabase
    .from("cron_recent_runs")
    .select("jobname,status,start_time,return_message")
    .neq("status", "succeeded")
    .gt("start_time", new Date(Date.now() - 6 * 3600 * 1000).toISOString())
    .order("start_time", { ascending: false })
    .limit(5);

  const failedCronCount = cronFails?.length ?? 0;
  const recent = recentCount ?? 0;

  // Decide alert
  let alertReason: string | null = null;
  if (recent < HEALTHY_THRESHOLD) {
    alertReason = `📉 Chỉ có *${recent}* bài mới trong ${WINDOW_HOURS}h qua (ngưỡng ${HEALTHY_THRESHOLD}).`;
  }
  if (failedCronCount >= 2) {
    const detail = (cronFails ?? []).map(c => `- ${c.jobname} @ ${c.start_time?.slice(11, 16)} ${c.status}`).join("\n");
    alertReason = (alertReason ?? "") + `\n\n⚠️ *${failedCronCount}* cron job fails:\n${detail}`;
  }

  if (alertReason) {
    const msg = `🚨 *luot247.com/d health alert*\n\n${alertReason}\n\nMở [EMERGENCY.md](https://github.com/lth91/luot247-scraper/blob/main/EMERGENCY.md) để xử lý.`;
    try {
      await sendTelegram(tgToken, tgChatId, msg);
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, alerted: false, error: String(e), recent, failedCronCount }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: true, alerted: true, recent, failedCronCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ ok: true, alerted: false, recent, failedCronCount }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
