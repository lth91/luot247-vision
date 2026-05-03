// Phase D — Source cleanup cron (02:30 UTC daily).
// 1. Recompute quality_score cho tất cả sources
// 2. Auto-disable: active sources với articles_14d=0 AND last_crawled_at < now()-3d
// 3. Auto-DELETE: disabled >30d AND 0 articles ever AND không phải manual disable
// 4. Log events vào source_event_log để Phase C health-check pickup → Telegram

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AUTO_DISABLE_DAYS_NO_ARTICLES = 14;
const AUTO_DELETE_DAYS_DISABLED = 30;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const stats = {
    sources_total: 0,
    scores_updated: 0,
    auto_disabled: [] as Array<{ id: string; name: string; reason: string }>,
    auto_deleted: [] as Array<{ id: string; name: string }>,
    errors: [] as string[],
  };

  // 1. Recompute quality_score cho mọi sources
  const { data: allSources, error: srcErr } = await supabase
    .from("electricity_sources")
    .select("id, name, is_active, tier, last_crawled_at, last_error, disabled_at");
  if (srcErr) {
    return new Response(JSON.stringify({ error: srcErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  stats.sources_total = allSources?.length ?? 0;

  for (const s of (allSources ?? []) as Array<{
    id: string;
    name: string;
    is_active: boolean;
    tier: number;
    last_crawled_at: string | null;
    last_error: string | null;
    disabled_at: string | null;
  }>) {
    const { data: scoreData, error: scoreErr } = await supabase.rpc("compute_source_quality_score", {
      p_source_id: s.id,
    });
    if (scoreErr) {
      stats.errors.push(`score ${s.name}: ${scoreErr.message}`);
      continue;
    }
    const score = (scoreData as number | null) ?? 0;
    await supabase
      .from("electricity_sources")
      .update({ quality_score: score })
      .eq("id", s.id);
    stats.scores_updated++;
  }

  // 2. Auto-disable: active + 0 articles 14d + last_crawled_at < now()-3d
  const day14 = new Date(Date.now() - AUTO_DISABLE_DAYS_NO_ARTICLES * 86400000).toISOString();
  const day3 = new Date(Date.now() - 3 * 86400000).toISOString();

  // Articles per source last 14d (excluding duplicates)
  const { data: news14d } = await supabase
    .from("electricity_news")
    .select("source_id")
    .gt("crawled_at", day14)
    .is("is_duplicate_of", null);

  const articlesBySource = new Map<string, number>();
  for (const n of (news14d ?? []) as Array<{ source_id: string }>) {
    articlesBySource.set(n.source_id, (articlesBySource.get(n.source_id) ?? 0) + 1);
  }

  // Active + 0 articles 14d + crawled recently (within 3d): source được poll
  // đều đặn nhưng không yield bài (selector nhặt link nhưng classifier reject hết,
  // hoặc bài bị dedup, hoặc fall ngoài window 3d) → underperforming.
  const candidatesToDisable = (allSources ?? [])
    .filter((s: typeof allSources[0]) =>
      s.is_active &&
      (articlesBySource.get(s.id) ?? 0) === 0 &&
      s.last_crawled_at !== null &&
      new Date(s.last_crawled_at) > new Date(day3)
    );

  for (const s of candidatesToDisable as typeof allSources) {
    const reason = `auto-disabled by cleanup ${new Date().toISOString().slice(0, 10)}: 0 articles 14d (last_crawled ${s.last_crawled_at?.slice(0, 10)})`;
    await supabase
      .from("electricity_sources")
      .update({ is_active: false, last_error: reason })
      .eq("id", s.id);
    await supabase
      .from("source_event_log")
      .insert({
        source_id: s.id,
        event_type: "disabled",
        detail: { auto: true, reason: "low_score_14d", articles_14d: 0 },
      });
    await supabase
      .from("source_cleanup_audit")
      .insert({
        action: "auto_disabled",
        source_id: s.id,
        source_name: s.name,
        detail: { reason: "low_score_14d", articles_14d: 0 },
      });
    stats.auto_disabled.push({ id: s.id, name: s.name, reason: "0 articles 14d" });
  }

  // 3. Auto-DELETE: disabled >30d, 0 articles ever, không phải manual hoặc Mac Mini waiting
  const day30 = new Date(Date.now() - AUTO_DELETE_DAYS_DISABLED * 86400000).toISOString();

  const candidatesToDelete = (allSources ?? [])
    .filter((s: typeof allSources[0]) =>
      !s.is_active &&
      s.disabled_at !== null &&
      new Date(s.disabled_at) < new Date(day30) &&
      // Không DELETE nếu manual hoặc đang đợi Mac Mini Scraper extension
      !(s.last_error ?? "").includes("manual") &&
      !(s.last_error ?? "").includes("Mac Mini Scraper") &&
      !(s.last_error ?? "").includes("luot247-scraper#")
    );

  for (const s of candidatesToDelete as typeof allSources) {
    // Defensive: chỉ DELETE nếu 0 articles ever
    const { count: articleCount } = await supabase
      .from("electricity_news")
      .select("*", { count: "exact", head: true })
      .eq("source_id", s.id);

    if ((articleCount ?? 0) > 0) {
      continue;
    }

    // Log audit BEFORE delete (audit table không FK nên không bị CASCADE).
    await supabase
      .from("source_cleanup_audit")
      .insert({
        action: "auto_deleted",
        source_id: s.id,
        source_name: s.name,
        detail: { disabled_at: s.disabled_at, last_error: s.last_error },
      });

    const { error: delErr } = await supabase
      .from("electricity_sources")
      .delete()
      .eq("id", s.id);
    if (delErr) {
      stats.errors.push(`delete ${s.name}: ${delErr.message}`);
      continue;
    }
    stats.auto_deleted.push({ id: s.id, name: s.name });
  }

  return new Response(
    JSON.stringify({ ok: true, stats }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
