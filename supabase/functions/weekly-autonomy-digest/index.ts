// Phase F — Weekly autonomy digest (Sunday 09:00 +07 = 02:00 UTC).
//
// Telegram report:
// - Coverage % (domains in our DB vs Google News VN last 7d)
// - 7-day metrics (articles inserted, sources delta)
// - Top 5 gap domains (≥5 mentions in GN, NOT trong DB)
// - 7-day autonomy actions (discovered/added/disabled/deleted)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendTelegram } from "../_shared/telegram.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const QUERIES: string[] = [
  'EVN OR "ngành điện" OR "lưới điện"',
  '"điện gió" OR "điện mặt trời" OR "BESS" OR "lưu trữ điện"',
  '"điện hạt nhân" OR "Quy hoạch điện 8" OR "DPPA"',
  '"giá điện" OR "tiết kiệm điện" OR "cung ứng điện"',
  '"PetroVietnam" OR "PV Power" OR "EVNGENCO" OR "PECC"',
];

const FETCH_TIMEOUT_MS = 20000;
const GAP_DOMAIN_MIN_MENTIONS = 5;
const GAP_DOMAINS_TO_SHOW = 5;

function getDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

async function fetchGoogleNewsDomains(query: string): Promise<Map<string, number>> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=vi&gl=VN&ceid=VN:vi`;
  const counts = new Map<string, number>();
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "vi,en;q=0.8" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return counts;
    const xml = await res.text();
    const matches = xml.match(/<source[^>]+url=["']([^"']+)["'][^>]*>/gi) || [];
    for (const m of matches) {
      const urlMatch = m.match(/url=["']([^"']+)["']/i);
      if (urlMatch) {
        const dom = getDomain(urlMatch[1]);
        if (dom) counts.set(dom, (counts.get(dom) ?? 0) + 1);
      }
    }
    return counts;
  } catch {
    return counts;
  }
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

  const supabase = createClient(supabaseUrl, serviceKey);
  const week = new Date(Date.now() - 7 * 86400000).toISOString();

  // 1. Aggregate Google News domains 7d (proxy)
  const gnDomains = new Map<string, number>();
  for (const q of QUERIES) {
    const counts = await fetchGoogleNewsDomains(q);
    for (const [dom, c] of counts) {
      gnDomains.set(dom, (gnDomains.get(dom) ?? 0) + c);
    }
  }

  // 2. Aggregate source domains từ electricity_news 7d
  const { data: ourNews } = await supabase
    .from("electricity_news")
    .select("source_domain, source_name, source_id")
    .gt("crawled_at", week)
    .is("is_duplicate_of", null);

  const ourDomains = new Set<string>();
  // Map source_id → base_url cho rows không có source_domain
  const { data: srcMap } = await supabase
    .from("electricity_sources")
    .select("id, base_url, name");
  const idToBaseDomain = new Map<string, string>();
  for (const s of (srcMap ?? []) as Array<{ id: string; base_url: string; name: string }>) {
    const d = getDomain(s.base_url);
    if (d) idToBaseDomain.set(s.id, d);
  }

  for (const r of (ourNews ?? []) as Array<{ source_domain: string | null; source_id: string }>) {
    if (r.source_domain) ourDomains.add(r.source_domain.replace(/^www\./, ""));
    else if (r.source_id && idToBaseDomain.has(r.source_id)) ourDomains.add(idToBaseDomain.get(r.source_id)!);
  }

  // 3. Coverage = overlap / GN domains
  let overlap = 0;
  for (const dom of ourDomains) if (gnDomains.has(dom)) overlap++;
  const coveragePct = gnDomains.size > 0 ? Math.round((overlap / gnDomains.size) * 100) : 0;

  // 4. Top gap domains (≥5 mentions, NOT in our DB)
  const gapDomains = [...gnDomains.entries()]
    .filter(([dom, count]) => count >= GAP_DOMAIN_MIN_MENTIONS && !ourDomains.has(dom))
    .sort((a, b) => b[1] - a[1])
    .slice(0, GAP_DOMAINS_TO_SHOW);

  // 5. 7-day metrics
  const { count: articles7d } = await supabase
    .from("electricity_news")
    .select("*", { count: "exact", head: true })
    .gt("crawled_at", week)
    .is("is_duplicate_of", null);

  const { count: sourcesActive } = await supabase
    .from("electricity_sources")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true);

  // 6. Autonomy actions 7d
  const { data: candidates7d } = await supabase
    .from("source_candidate_log")
    .select("status")
    .gt("discovered_at", week);
  const candidatesByStatus = (candidates7d ?? []).reduce((acc: Record<string, number>, r: { status: string }) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  const { data: cleanup7d } = await supabase
    .from("source_cleanup_audit")
    .select("action")
    .gt("created_at", week);
  const cleanupByAction = (cleanup7d ?? []).reduce((acc: Record<string, number>, r: { action: string }) => {
    acc[r.action] = (acc[r.action] ?? 0) + 1;
    return acc;
  }, {});

  // 7. Quality score top 3 + bottom 3
  const { data: topScored } = await supabase
    .from("electricity_sources")
    .select("name, quality_score")
    .eq("is_active", true)
    .order("quality_score", { ascending: false })
    .limit(3);

  // Compose message
  const gapBlock = gapDomains.length === 0
    ? "  (không có)"
    : gapDomains.map(([dom, c]) => `  • ${dom} (${c} mentions)`).join("\n");

  const topScoredBlock = (topScored && topScored.length > 0)
    ? topScored.map((s: { name: string; quality_score: number }) => `  • ${s.name}: ${s.quality_score}`).join("\n")
    : "  (chưa có data)";

  const coverageEmoji = coveragePct >= 70 ? "🟢" : coveragePct >= 40 ? "🟡" : "🔴";

  const msg =
`📅 *luot247.com/d weekly autonomy report*

📊 *7-day metrics:*
  • Articles inserted: ${articles7d ?? 0}
  • Sources active: ${sourcesActive ?? 0}

🎯 *Coverage estimate:* ${coverageEmoji} *${coveragePct}%*
  ${ourDomains.size} domains tracked / ${gnDomains.size} in Google News

🏆 *Top 3 quality score:*
${topScoredBlock}

⚠️ *Top gap (chưa cover):*
${gapBlock}

🤖 *Autonomy 7d:*
  • Discovered: ${candidates7d?.length ?? 0} candidates
  • Auto-added: ${candidatesByStatus.added ?? 0}
  • Auto-disabled: ${cleanupByAction.auto_disabled ?? 0}
  • Auto-deleted: ${cleanupByAction.auto_deleted ?? 0}

[Mở dashboard](https://www.luot247.com/d) | [EMERGENCY.md](https://github.com/lth91/luot247-scraper/blob/main/EMERGENCY.md)`;

  await sendTelegram(tgToken, tgChatId, msg);

  return new Response(
    JSON.stringify({
      ok: true,
      coverage_pct: coveragePct,
      our_domains: ourDomains.size,
      gn_domains: gnDomains.size,
      gap_top5: gapDomains,
      articles_7d: articles7d,
      candidates_7d: candidates7d?.length ?? 0,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
