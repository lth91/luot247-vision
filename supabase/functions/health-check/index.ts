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

function formatEventLine(e: SourceEvent | { source_name: string; source_tier: number; category: string; event_type: string; detail: Record<string, unknown> }): string {
  const name = e.source_name;
  switch (e.event_type) {
    case "added":
      return `🆕 ${name} (T${e.source_tier}, ${e.category})`;
    case "disabled": {
      const reason = ((e.detail.last_error as string) ?? "").slice(0, 60);
      return `🔴 ${name} disabled (fails=${e.detail.fails}${reason ? `, ${reason}` : ""})`;
    }
    case "recovered":
      return `✅ ${name} re-enabled`;
    case "failing": {
      const reason = ((e.detail.last_error as string) ?? "").slice(0, 60);
      return `⚠️ ${name} failing ${e.detail.fails}×${reason ? ` (${reason})` : ""}`;
    }
    case "fail_recovered":
      return `✅ ${name} fail recovered (was ${e.detail.was_fails}×)`;
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
      `✅ *luot247 health-check test*\nBot hoạt động. Anh sẽ chỉ nhận tin khi có sự cố thật hoặc state change source.`,
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

    // Top 5 active sources by quality_score
    const { data: topByScore } = await supabase
      .from("electricity_sources")
      .select("name, quality_score")
      .eq("is_active", true)
      .order("quality_score", { ascending: false })
      .limit(5);
    const topStr = (topByScore && topByScore.length > 0)
      ? topByScore.map((s: { name: string; quality_score: number }) =>
          `  • ${s.name}: ${s.quality_score} (${counts[s.name] ?? 0} bài 24h)`
        ).join("\n")
      : "  (không có)";

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
          return `  • ${s.name}: ${s.quality_score} (${ageDays}d ago)`;
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
      ? `⚠️ *${cronFails24.length}* cron fails / 24h`
      : `✅ Cron 24h: 0 fails`;

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
      const more = events24h.length > MAX_EVENTS_IN_REPORT ? `\n  …(+${events24h.length - MAX_EVENTS_IN_REPORT} more)` : "";
      eventsBlock = `\n📋 *Events 24h (${events24h.length}):*\n${lines.map((l: string) => `  ${l}`).join("\n")}${more}\n`;
    } else {
      eventsBlock = `\n📋 Events 24h: 0\n`;
    }

    const recent24 = d24.count ?? 0;
    const recent6 = d6.count ?? 0;
    const recent1 = d1.count ?? 0;
    const status = recent24 >= 30 ? "🟢" : recent24 >= 10 ? "🟡" : "🔴";

    const autoActionsBlock = (autoDisabled.length === 0 && autoDeleted.length === 0)
      ? `\n🤖 Auto-actions 24h: 0\n`
      : `\n🤖 *Auto-actions 24h:*\n` +
        (autoDisabled.length > 0
          ? `  • disabled (${autoDisabled.length}): ${autoDisabled.slice(0, 3).map((a: { source_name: string }) => a.source_name).join(", ")}${autoDisabled.length > 3 ? "…" : ""}\n`
          : "") +
        (autoDeleted.length > 0
          ? `  • deleted (${autoDeleted.length}): ${autoDeleted.slice(0, 3).map((a: { source_name: string }) => a.source_name).join(", ")}${autoDeleted.length > 3 ? "…" : ""}\n`
          : "");

    const discoveryBlock = ((discovery24?.length ?? 0) === 0)
      ? `🔍 Discovery 24h: 0\n`
      : `🔍 *Discovery 24h (${discovery24?.length ?? 0} candidates):*\n` +
        `  • added: ${discoveryStats.added ?? 0}${addedDomains.length > 0 ? ` (${addedDomains.slice(0, 3).join(", ")})` : ""}\n` +
        `  • rejected: ${(discoveryStats.rejected_anti_bot ?? 0) + (discoveryStats.rejected_no_rss ?? 0) + (discoveryStats.rejected_probe_fail ?? 0) + (discoveryStats.rejected_low_count ?? 0) + (discoveryStats.rejected_daily_limit ?? 0)}\n`;

    const msg =
`${status} *luot247.com/d daily report*

📊 *Bài insert:*
  • 1h: ${recent1}
  • 6h: ${recent6}
  • 24h: ${recent24}

🏆 *Top score:*
${topStr}

📉 *Bottom 3 active:*
${bottomStr}

${cronFailLine}
🛑 Disabled sources: ${disabledCount ?? "?"}
${autoActionsBlock}${discoveryBlock}${eventsBlock}
[Mở dashboard](https://www.luot247.com/d) | [EMERGENCY.md](https://github.com/lth91/luot247-scraper/blob/main/EMERGENCY.md)`;

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
    await sendTelegram(tgToken, tgChatId, `🚨 *luot247 health-check FAILED*\nDB query error: ${countErr.message}`);
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
    sections.push(`📉 Chỉ có *${recent}* bài mới trong ${WINDOW_HOURS}h qua (ngưỡng ${HEALTHY_THRESHOLD}).`);
  }
  if (failedCronCount >= 2) {
    const detail = (cronFails ?? [])
      .map((c: { jobname: string; status: string; start_time: string }) => `- ${c.jobname} @ ${c.start_time?.slice(11, 16)} ${c.status}`)
      .join("\n");
    sections.push(`⚠️ *${failedCronCount}* cron job fails:\n${detail}`);
  }
  if (events.length > 0) {
    const lines = events.slice(0, MAX_EVENTS_IN_ALERT).map(formatEventLine);
    const more = events.length > MAX_EVENTS_IN_ALERT ? `\n…(+${events.length - MAX_EVENTS_IN_ALERT} more)` : "";
    sections.push(`📋 *Source events (4h qua):*\n${lines.map((l) => `  ${l}`).join("\n")}${more}`);
  }

  const isEmergency = recent < HEALTHY_THRESHOLD || failedCronCount >= 2;
  const hasEvents = events.length > 0;

  if (isEmergency || hasEvents) {
    const header = isEmergency
      ? "🚨 *luot247.com/d health alert*"
      : "ℹ️ *luot247.com/d source events*";
    const msg = `${header}\n\n${sections.join("\n\n")}\n\nMở [EMERGENCY.md](https://github.com/lth91/luot247-scraper/blob/main/EMERGENCY.md) để xử lý.`;
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
