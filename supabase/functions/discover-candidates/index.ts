// Phase E — Auto-discovery candidate sources via Google News RSS.
// Cron 03:00 UTC daily.
//
// Flow:
// 1. Fetch 5 Google News RSS queries (utility/renewable/policy/operations/corporates)
// 2. Extract domain từ <source url="..."> element of each item
// 3. Group by domain, count occurrences in last 7 days
// 4. Diff với existing electricity_sources + electricity_news.source_domain
// 5. Top 5 unknown domains by count → probe HTTP
// 6. Probe: detect anti-bot, find RSS auto-discovery
// 7. Auto-INSERT max 3/day: tier=3, feed_type='rss', is_active=true
// 8. Log mọi candidate vào source_candidate_log

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const QUERIES: { seed: string; q: string }[] = [
  { seed: "utility", q: 'EVN OR "ngành điện" OR "lưới điện"' },
  { seed: "renewable", q: '"điện gió" OR "điện mặt trời" OR "BESS" OR "lưu trữ điện"' },
  { seed: "policy", q: '"điện hạt nhân" OR "Quy hoạch điện 8" OR "DPPA"' },
  { seed: "operations", q: '"giá điện" OR "tiết kiệm điện" OR "cung ứng điện"' },
  { seed: "corporates", q: '"PetroVietnam" OR "PV Power" OR "EVNGENCO" OR "PECC"' },
];

const MAX_AUTO_ADD_PER_DAY = 3;
const MAX_PLAYWRIGHT_HANDOVER_PER_DAY = 3;
const MIN_SAMPLE_COUNT = 3;
// Threshold handover Playwright = sample probe-eligible chung. Trước đây
// đặt 10 (sai expectation user "không-RSS → tự Mac Mini"). Sample thấp
// nếu ngon thì 7 ngày sau cron auto-promote, không thì auto-reject.
const MIN_SAMPLE_FOR_PLAYWRIGHT = MIN_SAMPLE_COUNT;
const TOP_N_CANDIDATES_TO_PROBE = 5;
const FETCH_TIMEOUT_MS = 20000;
const PROBE_TIMEOUT_MS = 12000;

type GnItem = { title: string; sourceUrl: string };
type DomainCandidate = {
  domain: string;
  count: number;
  sample_titles: string[];
  sample_urls: string[];
  query_seed: string;
};

function stripHtml(s: string): string {
  return s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function getDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function parseGoogleNewsRss(xml: string): GnItem[] {
  const items: GnItem[] = [];
  const matches = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const it of matches) {
    const titleMatch = it.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const sourceMatch = it.match(/<source[^>]+url=["']([^"']+)["'][^>]*>/i);
    if (titleMatch && sourceMatch) {
      items.push({
        title: stripHtml(titleMatch[1]),
        sourceUrl: sourceMatch[1],
      });
    }
  }
  return items;
}

async function fetchGoogleNews(query: string): Promise<GnItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=vi&gl=VN&ceid=VN:vi`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "vi,en;q=0.8" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    return parseGoogleNewsRss(await res.text());
  } catch {
    return [];
  }
}

type ProbeResult =
  | { viable: true; rss_url: string }
  | { viable: false; reason: "fetch_failed" | "http_error" | "anti_bot" | "no_rss"; html?: string };

// Extract article-like internal links từ HTML trang chủ.
// Heuristic phân biệt article vs category/tag page:
//   - Path length ≥ 25 chars (lọc category root)
//   - Có digit ID ≥4 chữ số (nhiều CMS Việt dùng /-12345 hoặc -12345.html)
//   - Hoặc path depth ≥ 2 (vd /category/article-slug)
//   - Bỏ asset (.css/.js/.png/...), bỏ anchor (#), bỏ navigation chuẩn
function extractInternalArticleLinks(html: string, domain: string): string[] {
  const urls = new Set<string>();
  const hrefRegex = /href=["']([^"'#]+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = hrefRegex.exec(html)) !== null) {
    let href = match[1].trim();
    if (!href || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:")) continue;

    // Resolve relative
    if (href.startsWith("//")) href = "https:" + href;
    else if (href.startsWith("/")) href = `https://${domain}${href}`;
    else if (!href.startsWith("http")) continue;

    // Internal-only
    let host: string;
    let pathname: string;
    try {
      const u = new URL(href);
      host = u.host.replace(/^www\./, "");
      pathname = u.pathname;
    } catch { continue; }
    if (host !== domain) continue;

    // Asset filter
    if (/\.(css|js|png|jpe?g|svg|gif|webp|ico|woff2?|ttf|eot|mp4|pdf|xml|json)(\?|$)/i.test(pathname)) continue;

    // Length filter (lọc /, /home, /tin-tuc — quá ngắn để là article)
    if (pathname.length < 25) continue;

    // Heuristic: hoặc có digit-id ≥4, hoặc path depth ≥ 2
    const hasDigitId = /\d{4,}/.test(pathname);
    const depth = pathname.split("/").filter((s) => s.length > 0).length;
    if (!hasDigitId && depth < 2) continue;

    urls.add(href);
  }
  return Array.from(urls).slice(0, 30);
}

// Suy luận link_pattern regex từ sample article URLs.
// Strategy:
//   1. Parse pathname từ mỗi URL
//   2. Tìm prefix segments chung (longest matching initial /-separated segments)
//   3. Detect file extension chung (vd .html, .htm, .chn) nếu có
//   4. Build regex: `^/<common>/.+(\.ext)?$`
// Trả null nếu không đủ samples (<3) hoặc paths quá khác nhau (no common prefix).
function inferLinkPattern(urls: string[]): string | null {
  const paths: string[] = [];
  for (const u of urls) {
    try {
      const p = new URL(u).pathname;
      if (p && p !== "/") paths.push(p);
    } catch { /* skip */ }
  }
  if (paths.length < 3) return null;

  const splits = paths.map((p) => p.split("/").filter((s) => s.length > 0));
  const minLen = Math.min(...splits.map((s) => s.length));
  const common: string[] = [];
  for (let i = 0; i < minLen; i++) {
    const seg = splits[0][i];
    // Bỏ qua segment cuối (slug bài) — không cần làm common
    if (i === minLen - 1) break;
    if (splits.every((s) => s[i] === seg)) common.push(seg);
    else break;
  }

  // Detect extension: tất cả paths cùng .X cuối → require trong pattern
  const exts = paths
    .map((p) => p.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase())
    .filter((e): e is string => !!e);
  const allSameExt = exts.length === paths.length && new Set(exts).size === 1;
  const extPart = allSameExt ? `\\.${exts[0]}$` : "";

  // Detect digit-ID: tất cả paths đều có ≥4 chữ số → require trong pattern
  // (Lọc nhiều navigation/category page như /tin-tuc.htm vs /article-slug-12345.htm)
  const allHaveDigitId = paths.every((p) => /\d{4,}/.test(p));

  // Build pattern: prefix (nếu có common) + middle (.+) + digit guard (nếu có) + ext
  let prefix: string;
  if (common.length > 0) {
    prefix = `^/${common.join("/")}/`;
  } else if (allSameExt || allHaveDigitId) {
    prefix = "^/";
  } else {
    // Không có common prefix, không có ext, không digit ID → quá lỏng, fail
    return null;
  }

  const middle = allHaveDigitId ? "[a-z0-9-]+\\d{4,}" : ".+";
  return prefix + middle + extPart;
}

// Gọi Claude Haiku để gợi ý content_selector hoặc skip nếu không cần.
// V1: skip LLM, dùng fallback selector. Mac Mini extractor đã có fallback chain
// "article, main, .content, .article-content, .news-content, div.fck_detail".
function inferContentSelector(_html: string): string | null {
  return null;
}

async function probe(domain: string): Promise<ProbeResult> {
  const homepageUrl = `https://${domain}`;
  let html: string;
  try {
    const res = await fetch(homepageUrl, {
      headers: { "User-Agent": UA, "Accept-Language": "vi,en;q=0.8" },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      redirect: "follow",
    });
    if (!res.ok) return { viable: false, reason: "http_error" };
    html = await res.text();
  } catch {
    return { viable: false, reason: "fetch_failed" };
  }

  // Anti-bot D1N cookie pattern (NPT, Lao Động, etc.)
  if (html.includes('document.cookie="D1N=') || html.includes("window.location.reload(true)")) {
    return { viable: false, reason: "anti_bot" };
  }

  // 1. RSS auto-discovery in <head>
  const rssLinkMatch = html.match(
    /<link[^>]+rel=["']alternate["'][^>]+type=["']application\/(rss|atom)\+xml["'][^>]+href=["']([^"']+)["']/i,
  ) || html.match(
    /<link[^>]+href=["']([^"']+)["'][^>]+type=["']application\/(rss|atom)\+xml["']/i,
  );
  if (rssLinkMatch) {
    let rssUrl = (rssLinkMatch[2] || rssLinkMatch[1]) as string;
    if (rssUrl.startsWith("/")) rssUrl = `https://${domain}${rssUrl}`;
    if (rssUrl.startsWith("//")) rssUrl = `https:${rssUrl}`;
    return { viable: true, rss_url: rssUrl };
  }

  // 2. Common RSS paths
  for (const path of ["/rss", "/feed", "/feed.xml", "/rss.xml", "/index.rss"]) {
    try {
      const r = await fetch(`https://${domain}${path}`, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) continue;
      const ct = r.headers.get("content-type") || "";
      if (ct.includes("xml") || ct.includes("rss") || ct.includes("atom")) {
        return { viable: true, rss_url: `https://${domain}${path}` };
      }
      // Fallback: peek body
      const body = await r.text();
      if (/<rss|<feed[\s>]/i.test(body) && body.includes("<item")) {
        return { viable: true, rss_url: `https://${domain}${path}` };
      }
    } catch { /* try next */ }
  }

  // No RSS — trả html để caller phục vụ Playwright handover (extract sample
  // article links từ trang chủ, infer link_pattern).
  return { viable: false, reason: "no_rss", html };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const stats = {
    queries_run: 0,
    total_items: 0,
    unique_domains: 0,
    known_skipped: 0,
    new_candidates: 0,
    probed: 0,
    viable: 0,
    auto_added: 0,
    playwright_added: 0,
    rejections: {} as Record<string, number>,
  };

  // 1. Fetch all queries
  const allItems: { item: GnItem; seed: string }[] = [];
  for (const q of QUERIES) {
    const items = await fetchGoogleNews(q.q);
    stats.queries_run++;
    stats.total_items += items.length;
    for (const it of items) allItems.push({ item: it, seed: q.seed });
  }

  // 2. Group by domain
  const byDomain = new Map<string, DomainCandidate>();
  for (const { item, seed } of allItems) {
    const dom = getDomain(item.sourceUrl);
    if (!dom) continue;
    const existing = byDomain.get(dom);
    if (existing) {
      existing.count++;
      if (existing.sample_titles.length < 5) existing.sample_titles.push(item.title.slice(0, 200));
      if (existing.sample_urls.length < 15) existing.sample_urls.push(item.sourceUrl);
    } else {
      byDomain.set(dom, {
        domain: dom,
        count: 1,
        sample_titles: [item.title.slice(0, 200)],
        sample_urls: [item.sourceUrl],
        query_seed: seed,
      });
    }
  }
  stats.unique_domains = byDomain.size;

  // 3. Diff vs existing electricity_sources + electricity_news
  const { data: existingSources } = await supabase
    .from("electricity_sources")
    .select("base_url");
  const knownDomains = new Set<string>(
    (existingSources ?? [])
      .map((s: { base_url: string }) => getDomain(s.base_url))
      .filter((d: string | null): d is string => d !== null),
  );

  const { data: existingDomains } = await supabase
    .from("electricity_news")
    .select("source_domain")
    .not("source_domain", "is", null)
    .gt("crawled_at", new Date(Date.now() - 30 * 86400000).toISOString());
  for (const r of (existingDomains ?? []) as Array<{ source_domain: string }>) {
    if (r.source_domain) knownDomains.add(r.source_domain.replace(/^www\./, ""));
  }

  // Bổ sung domain Mac Mini scraper đã cover via per-host naming
  // ("Mac Mini (host.tld)"). source_domain field hiện null trên các bài
  // Mac Mini, nên parse từ source_name. Tránh log noise "Probe fail" cho
  // domain Mac Mini đã làm việc tốt.
  const { data: macMiniNames } = await supabase
    .from("electricity_news")
    .select("source_name")
    .like("source_name", "Mac Mini (%")
    .gt("crawled_at", new Date(Date.now() - 30 * 86400000).toISOString());
  for (const r of (macMiniNames ?? []) as Array<{ source_name: string }>) {
    const m = r.source_name?.match(/^Mac Mini \(([^)]+)\)$/);
    if (m) knownDomains.add(m[1].replace(/^www\./, ""));
  }

  const candidates: DomainCandidate[] = [];
  for (const cand of byDomain.values()) {
    if (knownDomains.has(cand.domain)) {
      stats.known_skipped++;
      // Don't log known domains repeatedly — too noisy
      continue;
    }
    candidates.push(cand);
  }
  stats.new_candidates = candidates.length;

  // 4. Filter low-count + sort, take top N
  const toProbe = candidates
    .filter((c) => c.count >= MIN_SAMPLE_COUNT)
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_N_CANDIDATES_TO_PROBE);

  // Log low-count rejections (above MIN check applied)
  for (const cand of candidates.filter((c) => c.count < MIN_SAMPLE_COUNT)) {
    stats.rejections.low_count = (stats.rejections.low_count ?? 0) + 1;
    await supabase.from("source_candidate_log").insert({
      domain: cand.domain,
      sample_titles: cand.sample_titles,
      sample_count: cand.count,
      status: "rejected_low_count",
      decision_reason: `count=${cand.count} < ${MIN_SAMPLE_COUNT}`,
      query_seed: cand.query_seed,
    });
  }

  // 5. Probe + auto-add
  for (const cand of toProbe) {
    stats.probed++;
    if (stats.auto_added >= MAX_AUTO_ADD_PER_DAY) {
      stats.rejections.daily_limit = (stats.rejections.daily_limit ?? 0) + 1;
      await supabase.from("source_candidate_log").insert({
        domain: cand.domain,
        sample_titles: cand.sample_titles,
        sample_count: cand.count,
        status: "rejected_daily_limit",
        decision_reason: `daily limit ${MAX_AUTO_ADD_PER_DAY} reached`,
        query_seed: cand.query_seed,
      });
      continue;
    }

    const probeResult = await probe(cand.domain);
    if (!probeResult.viable) {
      // Playwright handover: site không có RSS nhưng sample đẹp + không bị
      // anti-bot. Phase E suy luận link_pattern từ sample URLs Google News và
      // INSERT row feed_type='playwright', pending_review=true. Mac Mini scraper
      // đọc DB sẽ pick up trong run kế tiếp, test 24h trước khi flip is_active.
      const isHandoverEligible =
        probeResult.reason === "no_rss" &&
        cand.count >= MIN_SAMPLE_FOR_PLAYWRIGHT &&
        stats.playwright_added < MAX_PLAYWRIGHT_HANDOVER_PER_DAY;

      // Debug fields cho mọi rejected_no_rss để dễ diagnose tại sao handover miss
      let handoverDebug = "";
      if (isHandoverEligible) {
        const htmlLen = probeResult.html?.length ?? 0;
        const articleLinks = probeResult.html
          ? extractInternalArticleLinks(probeResult.html, cand.domain)
          : [];
        const linkPattern = articleLinks.length >= 5 ? inferLinkPattern(articleLinks) : null;
        handoverDebug = ` [handover_debug: html=${htmlLen}b articles=${articleLinks.length} pattern=${linkPattern ?? 'null'}]`;
        if (linkPattern) {
          const today = new Date().toISOString().slice(0, 10);
          const scraperConfig = {
            list_url: `https://${cand.domain}/`,
            link_pattern: linkPattern,
            content_selector: null,
            category: "bao-chi",
            wait_after_load_ms: 4000,
          };
          const { data: insertedPw, error: pwErr } = await supabase
            .from("electricity_sources")
            .insert({
              name: `Mac Mini (${cand.domain})`,
              base_url: `https://${cand.domain}`,
              list_url: scraperConfig.list_url,
              feed_type: "playwright",
              list_link_pattern: linkPattern,
              article_content_selector: null,
              category: "bao-chi",
              tier: 3,
              is_active: false,
              pending_review: true,
              scraper_config: scraperConfig,
              consecutive_failures: 0,
              last_error: `auto-handover ${today} from Phase E: ${cand.count} GN articles in 7d, no RSS but sample URLs match pattern. Mac Mini test pending.`,
            })
            .select("id")
            .single();

          if (!pwErr && insertedPw) {
            stats.playwright_added++;
            await supabase.from("source_candidate_log").insert({
              domain: cand.domain,
              sample_titles: cand.sample_titles,
              sample_count: cand.count,
              status: "added_playwright_pending",
              decision_reason: `Playwright handover: ${linkPattern}`,
              query_seed: cand.query_seed,
              inserted_source_id: (insertedPw as { id: string }).id,
            });
            continue;
          }
        }
      }

      const statusMap: Record<string, string> = {
        anti_bot: "rejected_anti_bot",
        no_rss: "rejected_no_rss",
        fetch_failed: "rejected_probe_fail",
        http_error: "rejected_probe_fail",
      };
      const status = statusMap[probeResult.reason] ?? "rejected_probe_fail";
      stats.rejections[probeResult.reason] = (stats.rejections[probeResult.reason] ?? 0) + 1;
      await supabase.from("source_candidate_log").insert({
        domain: cand.domain,
        sample_titles: cand.sample_titles,
        sample_count: cand.count,
        status,
        decision_reason: probeResult.reason + handoverDebug,
        query_seed: cand.query_seed,
      });
      continue;
    }

    stats.viable++;
    const today = new Date().toISOString().slice(0, 10);
    const { data: inserted, error: insErr } = await supabase
      .from("electricity_sources")
      .insert({
        name: cand.domain,
        base_url: `https://${cand.domain}`,
        list_url: probeResult.rss_url,
        feed_type: "rss",
        list_link_pattern: null,
        article_content_selector: null,
        category: "bao-chi",
        tier: 3,
        is_active: true,
        consecutive_failures: 0,
        last_error: `auto-discovered ${today}: ${cand.count} articles in 7d Google News (${cand.query_seed})`,
      })
      .select("id")
      .single();

    if (insErr || !inserted) {
      await supabase.from("source_candidate_log").insert({
        domain: cand.domain,
        sample_titles: cand.sample_titles,
        sample_count: cand.count,
        status: "rejected_probe_fail",
        decision_reason: `INSERT failed: ${insErr?.message?.slice(0, 100) ?? "unknown"}`,
        query_seed: cand.query_seed,
      });
      continue;
    }

    stats.auto_added++;
    await supabase.from("source_candidate_log").insert({
      domain: cand.domain,
      sample_titles: cand.sample_titles,
      sample_count: cand.count,
      status: "added",
      decision_reason: `RSS detected: ${probeResult.rss_url}`,
      query_seed: cand.query_seed,
      inserted_source_id: (inserted as { id: string }).id,
    });
  }

  return new Response(JSON.stringify({ ok: true, stats }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
