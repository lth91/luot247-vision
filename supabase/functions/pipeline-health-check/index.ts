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

function friendlyFailReason(err: string | null | undefined): string {
  const e = (err ?? "").toLowerCase();
  if (!e) return "";
  if (e.includes("404") || e.includes("not found")) return "trang web không còn tồn tại";
  if (e.includes("403") || e.includes("forbidden")) return "trang web chặn truy cập";
  if (e.includes("error sending request") || e.includes("timeout") || e.includes("econnrefused") || e.includes("client error")) return "lỗi kết nối";
  if (e.includes("dns") || e.includes("name resolution")) return "không tìm thấy địa chỉ trang";
  if (e.includes("ssl") || e.includes("certificate")) return "lỗi chứng chỉ bảo mật";
  if (e.includes("no candidates") || (e.includes("rss") && e.includes("parsed"))) return "RSS không có bài hợp lệ";
  return (err ?? "").slice(0, 80);
}

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

  // Test mode: force gửi 1 Telegram message để verify pipeline alert hoạt động
  // (cron + secret + channel còn sống). Gọi: ?test=1
  const url = new URL(req.url);
  if (url.searchParams.get("test") === "1") {
    try {
      await sendTelegram(
        tgToken,
        tgChatId,
        `🧪 *Kiểm tra hệ thống giám sát*\n\nNếu anh thấy tin nhắn này nghĩa là hệ thống giám sát đang hoạt động bình thường. Mỗi 6 giờ hệ thống sẽ tự gửi cảnh báo nếu có sự cố thật.\n\n_${new Date().toISOString()}_`,
      );
      return new Response(JSON.stringify({ ok: true, test_sent: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
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
    alerts.push({ severity: "critical", msg: "Không có tin mới nào trong 6 giờ qua — hệ thống có thể đã ngừng hoạt động." });
  }

  // 2. Articles last 24h
  const { count: articles24h } = await sb
    .from("electricity_news")
    .select("*", { count: "exact", head: true })
    .gt("crawled_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString())
    .is("is_duplicate_of", null);
  stats.articles_24h = articles24h ?? 0;
  if ((articles24h ?? 0) < 10 && (articles24h ?? 0) > 0) {
    alerts.push({ severity: "warn", msg: `Số tin lấy được trong 24 giờ qua thấp bất thường: ${articles24h} tin (bình thường khoảng 30 tin).` });
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
      msg: `Mac Mini không lấy tin trong 3 giờ qua (lần cuối: ${mmLast ?? "chưa bao giờ"}). Cần kiểm tra kết nối Tailscale và dịch vụ LaunchAgent trên máy Mac.`,
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
    const reason = friendlyFailReason(s.last_error);
    alerts.push({
      severity: "warn",
      msg: `${s.name}: lỗi ${s.consecutive_failures} lần liên tiếp${reason ? ` — ${reason}` : ""}`,
    });
  }

  // 5. Pending playwright source không được cào ≥6h (Mac Mini không pick up DB row?)
  const { data: pendingStale } = await sb
    .from("electricity_sources")
    .select("name, last_crawled_at, created_at")
    .eq("feed_type", "playwright")
    .eq("pending_review", true);
  const pendingStaleNames: string[] = [];
  for (const p of (pendingStale ?? []) as Array<{ name: string; last_crawled_at: string | null; created_at: string }>) {
    const ageMs = Date.now() - new Date(p.created_at).getTime();
    if (ageMs < 60 * 60 * 1000) continue; // <1h cũ, chưa kịp cào
    const lastCrawlAge = p.last_crawled_at ? Date.now() - new Date(p.last_crawled_at).getTime() : Infinity;
    if (lastCrawlAge > 6 * 3600 * 1000) {
      pendingStaleNames.push(p.name);
    }
  }
  if (pendingStaleNames.length > 0) {
    const preview = pendingStaleNames.slice(0, 3).join(", ");
    const more = pendingStaleNames.length > 3 ? `, +${pendingStaleNames.length - 3} nguồn nữa` : "";
    alerts.push({
      severity: "warn",
      msg: `${pendingStaleNames.length} nguồn đang chờ Mac Mini xử lý nhưng đã 6 giờ chưa được thực hiện (${preview}${more}). Cần kiểm tra Mac Mini có nhận được danh sách nguồn mới không.`,
    });
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
      msg: `${parserFails} tin trong 24 giờ qua có lỗi định dạng trong phần tóm tắt — bộ xử lý nội dung có thể bị lỗi.`,
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
        msg: `Báo cáo hàng ngày không chạy trong 25 giờ qua (lần chạy gần nhất: ${last ?? "chưa bao giờ"}).`,
      });
    }
  }

  // Compose Telegram message — only send if any alerts
  if (alerts.length > 0) {
    const critical = alerts.filter((a) => a.severity === "critical");
    const warn = alerts.filter((a) => a.severity === "warn");
    const lines: string[] = [`🩺 *Cảnh báo hệ thống* — phát hiện ${alerts.length} vấn đề`];
    if (critical.length > 0) {
      lines.push("", "🚨 *Nghiêm trọng:*");
      for (const a of critical) lines.push(`  • ${a.msg}`);
    }
    if (warn.length > 0) {
      lines.push("", "⚠️ *Cần chú ý:*");
      for (const a of warn) lines.push(`  • ${a.msg}`);
    }
    lines.push("", `_Tin 6h: ${stats.articles_6h} · 24h: ${stats.articles_24h} · Mac Mini lần cuối: ${stats.macmini_last_crawl ?? "—"}_`);
    lines.push(`[Mở dashboard](https://www.luot247.com/ddashboard)`);
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
