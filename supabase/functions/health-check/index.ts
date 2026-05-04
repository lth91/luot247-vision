// Health check chạy mỗi 4 giờ.
// 1. Snapshot state per source vào source_health_snapshot
// 2. Compare với snapshot 4h trước → detect events (disabled, recovered, added, failing)
// 3. Log events vào source_event_log
// 4. Gửi Telegram alert nếu:
//    - Insert <HEALTHY_THRESHOLD bài/6h
//    - Cron fails ≥2
//    - Có events mới từ source diff
// Im lặng nếu cả 3 đều OK (không spam).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendTelegram } from "../_shared/telegram.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HEALTHY_THRESHOLD = 5;
const WINDOW_HOURS = 6;
const FAILING_THRESHOLD = 5;     // consecutive_failures cross this → 'failing' event
const MAX_EVENTS_IN_ALERT = 10;
const MAX_EVENTS_IN_REPORT = 15;

type SourceState = {
  id: string;
  name: string;
  category: string;
  tier: number;
  is_active: boolean;
  consecutive_failures: number;
  last_error: string | null;
};

type SourceEvent = {
  source_id: string;
  source_name: string;
  source_tier: number;
  category: string;
  event_type: "added" | "disabled" | "recovered" | "failing" | "fail_recovered";
  detail: Record<string, unknown>;
};

// deno-lint-ignore no-explicit-any
async function snapshotAndDetectEvents(supabase: any): Promise<SourceEvent[]> {
  const day = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const { data: current } = await supabase
    .from("electricity_sources")
    .select("id, name, category, tier, is_active, consecutive_failures, last_error");
  if (!current || current.length === 0) return [];

  const { data: newsRows } = await supabase
    .from("electricity_news")
    .select("source_id")
    .gt("crawled_at", day)
    .is("is_duplicate_of", null);
  const articleCounts = new Map<string, number>();
  for (const r of (newsRows ?? []) as Array<{ source_id: string }>) {
    articleCounts.set(r.source_id, (articleCounts.get(r.source_id) ?? 0) + 1);
  }

  // Snapshots cũ — lấy >1h trước (buffer cron drift). Most recent per source.
  const cutoff = new Date(Date.now() - 1 * 3600 * 1000).toISOString();
  const { data: prevSnapshots } = await supabase
    .from("source_health_snapshot")
    .select("source_id, is_active, consecutive_failures, snapshot_at")
    .lt("snapshot_at", cutoff)
    .order("snapshot_at", { ascending: false });

  type PrevRow = { source_id: string; is_active: boolean; consecutive_failures: number };
  const prevMap = new Map<string, PrevRow>();
  for (const s of (prevSnapshots ?? []) as PrevRow[]) {
    if (!prevMap.has(s.source_id)) prevMap.set(s.source_id, s);
  }

  const isFirstRun = (prevSnapshots?.length ?? 0) === 0;
  const events: SourceEvent[] = [];

  if (!isFirstRun) {
    for (const c of current as SourceState[]) {
      const p = prevMap.get(c.id);
      const base = {
        source_id: c.id,
        source_name: c.name,
        source_tier: c.tier,
        category: c.category,
      };
      if (!p) {
        events.push({ ...base, event_type: "added", detail: { tier: c.tier, category: c.category } });
        continue;
      }
      if (p.is_active && !c.is_active) {
        events.push({
          ...base,
          event_type: "disabled",
          detail: { fails: c.consecutive_failures, last_error: (c.last_error ?? "").slice(0, 200) },
        });
      } else if (!p.is_active && c.is_active) {
        events.push({ ...base, event_type: "recovered", detail: {} });
      } else if (
        c.is_active &&
        p.consecutive_failures < FAILING_THRESHOLD &&
        c.consecutive_failures >= FAILING_THRESHOLD
      ) {
        events.push({
          ...base,
          event_type: "failing",
          detail: { fails: c.consecutive_failures, last_error: (c.last_error ?? "").slice(0, 200) },
        });
      } else if (c.is_active && p.consecutive_failures > 0 && c.consecutive_failures === 0) {
        events.push({ ...base, event_type: "fail_recovered", detail: { was_fails: p.consecutive_failures } });
      }
    }
  }

  // Snapshot insert (luôn, kể cả first run để run sau có baseline)
  const snapshotRows = (current as SourceState[]).map((c) => ({
    source_id: c.id,
    is_active: c.is_active,
    consecutive_failures: c.consecutive_failures,
    articles_24h: articleCounts.get(c.id) ?? 0,
    last_error: c.last_error,
  }));
  await supabase.from("source_health_snapshot").insert(snapshotRows);

  // Event log
  if (events.length > 0) {
    await supabase.from("source_event_log").insert(
      events.map((e) => ({
        source_id: e.source_id,
        event_type: e.event_type,
        detail: e.detail,
      })),
    );
  }

  return events;
}

function categoryName(c: string): string {
  switch (c) {
    case "bao-chi": return "báo chí";
    case "doanh-nghiep": return "doanh nghiệp";
    case "co-quan": return "cơ quan";
    default: return c;
  }
}

function friendlyDisableReason(detail: Record<string, unknown>): string {
  const err = ((detail.last_error as string) ?? "").toLowerCase();
  const noArticleMatch = err.match(/(\d+)\s*articles?\s*(\d+)d/);
  if (noArticleMatch && noArticleMatch[1] === "0") {
    return `${noArticleMatch[2]} ngày không có tin mới`;
  }
  const fails = detail.fails;
  const failsNum = typeof fails === "number" && fails > 0 ? fails : null;
  if (err.includes("error sending request") || err.includes("timeout") || err.includes("econnrefused") || err.includes("client error")) {
    return failsNum ? `${failsNum} lần lỗi kết nối` : "lỗi kết nối";
  }
  if (err.includes("404") || err.includes("not found")) return "trang web không còn tồn tại";
  if (err.includes("403") || err.includes("forbidden")) return "trang web chặn truy cập";
  if (err.includes("dns") || err.includes("name resolution")) return "không tìm thấy địa chỉ trang";
  if (err.includes("ssl") || err.includes("certificate")) return "lỗi chứng chỉ bảo mật";
  if (failsNum) return `${failsNum} lần lỗi liên tiếp`;
  return "";
}

function friendlyAge(days: number): string {
  if (days >= 999) return "chưa lấy được tin lần nào";
  if (days <= 0) return "hôm nay chưa có tin";
  if (days === 1) return "1 ngày qua chưa có tin";
  return `${days} ngày qua chưa có tin`;
}

function formatEventLine(e: SourceEvent | { source_name: string; source_tier: number; category: string; event_type: string; detail: Record<string, unknown> }): string {
  const name = e.source_name;
  const cat = categoryName(e.category);
  switch (e.event_type) {
    case "added":
      return `🆕 Thêm nguồn: ${name} (${cat})`;
    case "disabled": {
      const reason = friendlyDisableReason(e.detail);
      return `🔴 Tạm dừng: ${name}${reason ? ` — ${reason}` : ""}`;
    }
    case "recovered":
      return `✅ Đã bật lại: ${name}`;
    case "failing": {
      const reason = friendlyDisableReason(e.detail);
      return `⚠️ ${name} đang gặp lỗi${reason ? ` — ${reason}` : ""}`;
    }
    case "fail_recovered":
      return `✅ ${name} đã hết lỗi`;
    default:
      return `${e.event_type}: ${name}`;
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

  // Test mode
  if (url.searchParams.get("test") === "1") {
    await sendTelegram(
      tgToken,
      tgChatId,
      `✅ *Báo cáo kiểm tra — luot247.com/d*\nHệ thống thông báo đang hoạt động. Anh sẽ chỉ nhận tin khi có sự cố hoặc khi nguồn tin có thay đổi.`,
    );
    return new Response(JSON.stringify({ ok: true, test: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Report mode (daily 3x/ngày)
  if (url.searchParams.get("report") === "1") {
    const day = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const sixH = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
    const oneH = new Date(Date.now() - 1 * 3600 * 1000).toISOString();

    const [d24, d6, d1] = await Promise.all([
      supabase.from("electricity_news").select("*", { count: "exact", head: true }).gt("crawled_at", day),
      supabase.from("electricity_news").select("*", { count: "exact", head: true }).gt("crawled_at", sixH),
      supabase.from("electricity_news").select("*", { count: "exact", head: true }).gt("crawled_at", oneH),
    ]);

    const { data: bySource } = await supabase
      .from("electricity_news")
      .select("source_name")
      .gt("crawled_at", day);
    const counts: Record<string, number> = {};
    (bySource ?? []).forEach((r: { source_name: string }) => {
      counts[r.source_name] = (counts[r.source_name] ?? 0) + 1;
    });

    // Top 5 active sources by 24h article count (friendly: ai lấy được nhiều tin nhất)
    const topByCount = Object.entries(counts)
      .filter(([_, n]) => (n as number) > 0)
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .slice(0, 5);
    const topStr = topByCount.length > 0
      ? topByCount.map(([name, n]) => `  • ${name}: ${n} tin`).join("\n")
      : "  (không có nguồn nào lấy được tin)";

    // Bottom 3 active sources by quality_score (problems)
    const { data: bottomByScore } = await supabase
      .from("electricity_sources")
      .select("name, quality_score, last_crawled_at")
      .eq("is_active", true)
      .order("quality_score", { ascending: true })
      .limit(3);
    const bottomStr = (bottomByScore && bottomByScore.length > 0)
      ? bottomByScore.map((s: { name: string; quality_score: number; last_crawled_at: string | null }) => {
          const ageDays = s.last_crawled_at
            ? Math.floor((Date.now() - new Date(s.last_crawled_at).getTime()) / 86400000)
            : 999;
          return `  • ${s.name} — ${friendlyAge(ageDays)}`;
        }).join("\n")
      : "  (không có)";

    // Auto-actions 24h từ source_cleanup_audit
    const { data: autoActions24 } = await supabase
      .from("source_cleanup_audit")
      .select("action, source_name, detail")
      .gt("created_at", day)
      .order("created_at", { ascending: false })
      .limit(20);
    const autoDisabled = (autoActions24 ?? []).filter((a: { action: string }) => a.action === "auto_disabled");
    const autoDeleted = (autoActions24 ?? []).filter((a: { action: string }) => a.action === "auto_deleted");

    // Discovery 24h từ source_candidate_log (Phase E)
    const { data: discovery24 } = await supabase
      .from("source_candidate_log")
      .select("status, domain")
      .gt("discovered_at", day)
      .limit(200);
    const discoveryStats = (discovery24 ?? []).reduce((acc: Record<string, number>, r: { status: string }) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {});
    const addedDomains = (discovery24 ?? [])
      .filter((r: { status: string }) => r.status === "added")
      .map((r: { domain: string }) => r.domain);

    const { data: cronFails24 } = await supabase
      .from("cron_recent_runs")
      .select("jobname,status,start_time")
      .neq("status", "succeeded")
      .gt("start_time", day)
      .order("start_time", { ascending: false })
      .limit(10);
    const cronFailLine = cronFails24 && cronFails24.length > 0
      ? `⚠️ *${cronFails24.length}* lần hệ thống chạy lỗi (24h qua)`
      : `✅ Hệ thống chạy ổn định (không lỗi 24h qua)`;

    const { count: disabledCount } = await supabase
      .from("electricity_sources")
      .select("*", { count: "exact", head: true })
      .eq("is_active", false);

    // Events 24h từ source_event_log
    const { data: events24h } = await supabase
      .from("source_event_log")
      .select("event_type, detail, created_at, source_id")
      .gt("created_at", day)
      .order("created_at", { ascending: false })
      .limit(MAX_EVENTS_IN_REPORT * 2);

    let eventsBlock = "";
    if (events24h && events24h.length > 0) {
      const sourceIds = [...new Set(events24h.map((e: { source_id: string }) => e.source_id))];
      const { data: sourcesData } = await supabase
        .from("electricity_sources")
        .select("id, name, tier, category")
        .in("id", sourceIds);
      const sourceMap = new Map(
        (sourcesData ?? []).map((s: { id: string; name: string; tier: number; category: string }) => [s.id, s]),
      );
      const lines = events24h.slice(0, MAX_EVENTS_IN_REPORT).map((e: { event_type: string; detail: Record<string, unknown>; source_id: string }) => {
        const s = sourceMap.get(e.source_id) as { name: string; tier: number; category: string } | undefined;
        return formatEventLine({
          source_name: s?.name ?? "?",
          source_tier: s?.tier ?? 3,
          category: s?.category ?? "?",
          event_type: e.event_type,
          detail: e.detail,
        });
      });
      const more = events24h.length > MAX_EVENTS_IN_REPORT ? `\n  …(+${events24h.length - MAX_EVENTS_IN_REPORT} sự kiện nữa)` : "";
      eventsBlock = `\n📋 *Hoạt động 24h (${events24h.length} sự kiện):*\n${lines.map((l: string) => `  ${l}`).join("\n")}${more}\n`;
    } else {
      eventsBlock = `\n📋 Hoạt động 24h: không có gì đặc biệt\n`;
    }

    const recent24 = d24.count ?? 0;
    const recent6 = d6.count ?? 0;
    const recent1 = d1.count ?? 0;
    const status = recent24 >= 30 ? "🟢" : recent24 >= 10 ? "🟡" : "🔴";

    const autoActionsBlock = (autoDisabled.length === 0 && autoDeleted.length === 0)
      ? `\n🤖 Hệ thống tự xử lý 24h: không có\n`
      : `\n🤖 *Hệ thống tự xử lý 24h:*\n` +
        (autoDisabled.length > 0
          ? `  • Đã tạm dừng ${autoDisabled.length} nguồn: ${autoDisabled.slice(0, 3).map((a: { source_name: string }) => a.source_name).join(", ")}${autoDisabled.length > 3 ? "…" : ""}\n`
          : "") +
        (autoDeleted.length > 0
          ? `  • Đã xoá ${autoDeleted.length} nguồn: ${autoDeleted.slice(0, 3).map((a: { source_name: string }) => a.source_name).join(", ")}${autoDeleted.length > 3 ? "…" : ""}\n`
          : "");

    const rejectedTotal =
      (discoveryStats.rejected_anti_bot ?? 0) +
      (discoveryStats.rejected_no_rss ?? 0) +
      (discoveryStats.rejected_probe_fail ?? 0) +
      (discoveryStats.rejected_low_count ?? 0) +
      (discoveryStats.rejected_daily_limit ?? 0);
    const discoveryBlock = ((discovery24?.length ?? 0) === 0)
      ? `🔍 Tìm nguồn mới 24h: chưa quét\n`
      : `🔍 *Tìm nguồn mới (đã quét ${discovery24?.length ?? 0} trang web):*\n` +
        `  • Thêm mới: ${discoveryStats.added ?? 0}${addedDomains.length > 0 ? ` (${addedDomains.slice(0, 3).join(", ")})` : ""}\n` +
        `  • Bỏ qua (không phù hợp): ${rejectedTotal}\n`;

    const msg =
`${status} *Báo cáo hàng ngày — luot247.com/d*

📊 *Tin tự động lấy về:*
  • 1 giờ qua: ${recent1} tin
  • 6 giờ qua: ${recent6} tin
  • Cả ngày qua: ${recent24} tin

🏆 *Nguồn lấy được nhiều tin nhất 24h:*
${topStr}

📉 *Nguồn cần để ý:*
${bottomStr}

${cronFailLine}
🛑 Số nguồn đang tạm dừng: ${disabledCount ?? "?"}
${autoActionsBlock}${discoveryBlock}${eventsBlock}
[Mở dashboard](https://www.luot247.com/d) | [Hướng dẫn xử lý sự cố](https://github.com/lth91/luot247-scraper/blob/main/EMERGENCY.md)`;

    await sendTelegram(tgToken, tgChatId, msg);
    return new Response(
      JSON.stringify({ ok: true, report: true, recent24, recent6, recent1, events24h: events24h?.length ?? 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Normal mode (4h cron)
  const since = new Date(Date.now() - WINDOW_HOURS * 3600 * 1000).toISOString();

  const { count: recentCount, error: countErr } = await supabase
    .from("electricity_news")
    .select("*", { count: "exact", head: true })
    .gt("crawled_at", since);

  if (countErr) {
    await sendTelegram(tgToken, tgChatId, `🚨 *Sự cố hệ thống — luot247.com/d*\nKhông truy vấn được cơ sở dữ liệu: ${countErr.message}`);
    return new Response(JSON.stringify({ ok: false, error: countErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: cronFails } = await supabase
    .from("cron_recent_runs")
    .select("jobname,status,start_time,return_message")
    .neq("status", "succeeded")
    .gt("start_time", new Date(Date.now() - 6 * 3600 * 1000).toISOString())
    .order("start_time", { ascending: false })
    .limit(5);

  const failedCronCount = cronFails?.length ?? 0;
  const recent = recentCount ?? 0;

  // Snapshot + events
  let events: SourceEvent[] = [];
  try {
    events = await snapshotAndDetectEvents(supabase);
  } catch (e) {
    // Không crash health check nếu snapshot lỗi — log và tiếp tục
    console.error("snapshotAndDetectEvents failed:", (e as Error)?.message);
  }

  const sections: string[] = [];
  if (recent < HEALTHY_THRESHOLD) {
    sections.push(`📉 Chỉ có *${recent}* tin mới trong ${WINDOW_HOURS} giờ qua (mức bình thường là ${HEALTHY_THRESHOLD} tin).`);
  }
  if (failedCronCount >= 2) {
    const detail = (cronFails ?? [])
      .map((c: { jobname: string; status: string; start_time: string }) => `- ${c.jobname} lúc ${c.start_time?.slice(11, 16)} (${c.status})`)
      .join("\n");
    sections.push(`⚠️ *${failedCronCount}* lần hệ thống chạy lỗi:\n${detail}`);
  }
  if (events.length > 0) {
    const lines = events.slice(0, MAX_EVENTS_IN_ALERT).map(formatEventLine);
    const more = events.length > MAX_EVENTS_IN_ALERT ? `\n…(+${events.length - MAX_EVENTS_IN_ALERT} sự kiện nữa)` : "";
    sections.push(`📋 *Hoạt động nguồn tin (4 giờ qua):*\n${lines.map((l) => `  ${l}`).join("\n")}${more}`);
  }

  const isEmergency = recent < HEALTHY_THRESHOLD || failedCronCount >= 2;
  const hasEvents = events.length > 0;

  if (isEmergency || hasEvents) {
    const header = isEmergency
      ? "🚨 *Cảnh báo sự cố — luot247.com/d*"
      : "ℹ️ *Có thay đổi nguồn tin — luot247.com/d*";
    const msg = `${header}\n\n${sections.join("\n\n")}\n\nXem [Hướng dẫn xử lý sự cố](https://github.com/lth91/luot247-scraper/blob/main/EMERGENCY.md) nếu cần.`;
    try {
      await sendTelegram(tgToken, tgChatId, msg);
    } catch (e) {
      return new Response(
        JSON.stringify({ ok: false, alerted: false, error: String(e), recent, failedCronCount, events: events.length }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({ ok: true, alerted: true, isEmergency, recent, failedCronCount, events: events.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({ ok: true, alerted: false, recent, failedCronCount, events: events.length }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
