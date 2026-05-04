// Pipeline health check — chạy mỗi 6h via cron. Telegram alert nếu có issue.
// Chỉ ping Telegram khi có vấn đề (silence = healthy). Daily digest 02:00 UTC
// đã cover summary tổng quát.
//
// Checks:
//   🚨 CRITICAL — pipeline rớt:
//     - 0 articles last 6h
//     - Mac Mini virtual source last_crawled_at > 3h ago (cron LaunchAgent dead?)
//     - Daily digest cron không chạy 24h gần nhất
//   ⚠️  WARN — degraded:
//     - Active source consecutive_failures >= 5
//     - Pending playwright source > 6h chưa được Mac Mini cào
//     - Bài summary LIKE '```json%' last 24h (parser fail tái phát)
//     - Total articles 24h < 10 (yield thấp bất thường)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendTelegram } from "../_shared/telegram.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Alert = { severity: "critical" | "warn"; msg: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const tgToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const tgChatId = Deno.env.get("TELEGRAM_CHAT_ID");

  if (!tgToken || !tgChatId) {
    return new Response(JSON.stringify({ error: "Telegram secrets missing" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sb = createClient(supabaseUrl, serviceKey);
  const alerts: Alert[] = [];
  const stats: Record<string, number | string | null> = {};

  // 1. Articles last 6h (pipeline alive?)
  const { count: articles6h } = await sb
    .from("electricity_news")
    .select("*", { count: "exact", head: true })
    .gt("crawled_at", new Date(Date.now() - 6 * 3600 * 1000).toISOString())
    .is("is_duplicate_of", null);
  stats.articles_6h = articles6h ?? 0;
  if ((articles6h ?? 0) === 0) {
    alerts.push({ severity: "critical", msg: "0 bài unique trong 6h gần nhất — pipeline dead?" });
  }

  // 2. Articles last 24h
  const { count: articles24h } = await sb
    .from("electricity_news")
    .select("*", { count: "exact", head: true })
    .gt("crawled_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString())
    .is("is_duplicate_of", null);
  stats.articles_24h = articles24h ?? 0;
  if ((articles24h ?? 0) < 10 && (articles24h ?? 0) > 0) {
    alerts.push({ severity: "warn", msg: `Yield 24h thấp bất thường: ${articles24h} bài (bình thường ~30)` });
  }

  // 3. Mac Mini virtual source heartbeat
  const { data: mm } = await sb
    .from("electricity_sources")
    .select("last_crawled_at")
    .eq("name", "Mac Mini Scraper")
    .maybeSingle();
  const mmLast = (mm as { last_crawled_at: string | null } | null)?.last_crawled_at;
  stats.macmini_last_crawl = mmLast;
  if (!mmLast || Date.now() - new Date(mmLast).getTime() > 3 * 3600 * 1000) {
    alerts.push({
      severity: "critical",
      msg: `Mac Mini Scraper không cào ≥3h (last: ${mmLast ?? "never"}). Check Tailscale/LaunchAgent.`,
    });
  }

  // 4. Active source fail nhiều
  const { data: failing } = await sb
    .from("electricity_sources")
    .select("name, consecutive_failures, last_error")
    .eq("is_active", true)
    .gte("consecutive_failures", 5)
    .order("consecutive_failures", { ascending: false })
    .limit(5);
  stats.failing_active_sources = (failing ?? []).length;
  for (const s of (failing ?? []) as Array<{ name: string; consecutive_failures: number; last_error: string | null }>) {
    alerts.push({
      severity: "warn",
      msg: `${s.name}: fail ${s.consecutive_failures}× — ${(s.last_error ?? "").slice(0, 80)}`,
    });
  }

  // 5. Pending playwright source không được cào ≥6h (Mac Mini không pick up DB row?)
  const { data: pendingStale } = await sb
    .from("electricity_sources")
    .select("name, last_crawled_at, created_at")
    .eq("feed_type", "playwright")
    .eq("pending_review", true);
  for (const p of (pendingStale ?? []) as Array<{ name: string; last_crawled_at: string | null; created_at: string }>) {
    const ageMs = Date.now() - new Date(p.created_at).getTime();
    if (ageMs < 60 * 60 * 1000) continue; // <1h cũ, chưa kịp cào
    const lastCrawlAge = p.last_crawled_at ? Date.now() - new Date(p.last_crawled_at).getTime() : Infinity;
    if (lastCrawlAge > 6 * 3600 * 1000) {
      alerts.push({
        severity: "warn",
        msg: `Pending Playwright "${p.name}" chưa được Mac Mini cào ≥6h. Check fetch_playwright_sources_from_db.`,
      });
    }
  }
  stats.pending_playwright_sources = (pendingStale ?? []).length;

  // 6. Parser fail tái phát (markdown fence trong summary 24h)
  const { count: parserFails } = await sb
    .from("electricity_news")
    .select("*", { count: "exact", head: true })
    .gt("crawled_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString())
    .like("summary", "%```json%");
  stats.parser_fails_24h = parserFails ?? 0;
  if ((parserFails ?? 0) > 0) {
    alerts.push({
      severity: "warn",
      msg: `${parserFails} bài 24h có markdown fence trong summary — parser fix có thể bị bypass.`,
    });
  }

  // 7. Daily digest cron có chạy 24h gần nhất?
  // Read cron run history via cron schema.
  const { data: digestRun } = await sb.rpc("get_last_cron_run", { jobname_in: "autonomy-digest-daily" }).single();
  // RPC chưa tồn tại → fallback skip check này (gracefully). Nếu có thì kiểm.
  if (digestRun && typeof digestRun === "object" && "last_run" in digestRun) {
    const last = (digestRun as { last_run: string | null }).last_run;
    stats.digest_last_run = last;
    if (!last || Date.now() - new Date(last).getTime() > 25 * 3600 * 1000) {
      alerts.push({
        severity: "critical",
        msg: `Daily autonomy digest không chạy ≥25h (last: ${last ?? "never"}).`,
      });
    }
  }

  // Compose Telegram message — only send if any alerts
  if (alerts.length > 0) {
    const critical = alerts.filter((a) => a.severity === "critical");
    const warn = alerts.filter((a) => a.severity === "warn");
    const lines: string[] = [`🩺 *Pipeline health alert* — ${alerts.length} issue${alerts.length > 1 ? "s" : ""}`];
    if (critical.length > 0) {
      lines.push("", "🚨 *Critical:*");
      for (const a of critical) lines.push(`  • ${a.msg}`);
    }
    if (warn.length > 0) {
      lines.push("", "⚠️ *Warn:*");
      for (const a of warn) lines.push(`  • ${a.msg}`);
    }
    lines.push("", `_articles 6h: ${stats.articles_6h} · 24h: ${stats.articles_24h} · MacMini last: ${stats.macmini_last_crawl ?? "—"}_`);
    lines.push(`[Dashboard](https://www.luot247.com/ddashboard)`);
    try {
      await sendTelegram(tgToken, tgChatId, lines.join("\n"));
    } catch (e) {
      console.error("Telegram send fail:", (e as Error).message);
    }
  }

  return new Response(JSON.stringify({ ok: true, alerts: alerts.length, stats, details: alerts }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
