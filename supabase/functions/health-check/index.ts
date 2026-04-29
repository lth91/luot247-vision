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

  const url = new URL(req.url);
  const supabase = createClient(supabaseUrl, serviceKey);

  // Test mode: ?test=1 → always send a confirmation message (verify Telegram path).
  if (url.searchParams.get("test") === "1") {
    await sendTelegram(tgToken, tgChatId,
      `✅ *luot247 health-check test*\nBot hoạt động. Anh sẽ chỉ nhận tin khi có sự cố thật.`);
    return new Response(JSON.stringify({ ok: true, test: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Report mode: ?report=1 → always send full status summary (cho daily report 3x/ngày).
  if (url.searchParams.get("report") === "1") {
    const day = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const sixH = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
    const oneH = new Date(Date.now() - 1 * 3600 * 1000).toISOString();

    const [d24, d6, d1] = await Promise.all([
      supabase.from("electricity_news").select("*", { count: "exact", head: true }).gt("crawled_at", day),
      supabase.from("electricity_news").select("*", { count: "exact", head: true }).gt("crawled_at", sixH),
      supabase.from("electricity_news").select("*", { count: "exact", head: true }).gt("crawled_at", oneH),
    ]);

    // Top 5 sources 24h
    const { data: bySource } = await supabase
      .from("electricity_news")
      .select("source_name")
      .gt("crawled_at", day);
    const counts: Record<string, number> = {};
    (bySource ?? []).forEach((r: { source_name: string }) => {
      counts[r.source_name] = (counts[r.source_name] ?? 0) + 1;
    });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topStr = top.length ? top.map(([n, c]) => `  • ${n}: ${c}`).join("\n") : "  (không có)";

    // Cron failures last 24h
    const { data: cronFails24 } = await supabase
      .from("cron_recent_runs")
      .select("jobname,status,start_time")
      .neq("status", "succeeded")
      .gt("start_time", day)
      .order("start_time", { ascending: false })
      .limit(10);
    const cronFailLine = (cronFails24 && cronFails24.length > 0)
      ? `⚠️ *${cronFails24.length}* cron fails / 24h`
      : `✅ Cron 24h: 0 fails`;

    // Disabled sources count
    const { count: disabledCount } = await supabase
      .from("electricity_sources")
      .select("*", { count: "exact", head: true })
      .eq("is_active", false);

    const recent24 = d24.count ?? 0;
    const recent6 = d6.count ?? 0;
    const recent1 = d1.count ?? 0;

    const status = recent24 >= 30 ? "🟢" : recent24 >= 10 ? "🟡" : "🔴";
    const msg =
`${status} *luot247.com/d daily report*

📊 *Bài insert:*
  • 1h: ${recent1}
  • 6h: ${recent6}
  • 24h: ${recent24}

🏆 *Top nguồn 24h:*
${topStr}

${cronFailLine}
🛑 Disabled sources: ${disabledCount ?? "?"}

[Mở dashboard](https://www.luot247.com/d) | [EMERGENCY.md](https://github.com/lth91/luot247-scraper/blob/main/EMERGENCY.md)`;

    await sendTelegram(tgToken, tgChatId, msg);
    return new Response(JSON.stringify({ ok: true, report: true, recent24, recent6, recent1 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

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
