// Discovery RSS: hút tin ngành điện/năng lượng VN từ RSS báo lớn, lọc bằng Claude Haiku, insert electricity_news.
// Bổ sung cho crawl-electricity-news (chạy song song), giúp tăng coverage mà không cần maintain selector mỗi báo.
//
// Flow: Fetch 15 RSS feed → dedupe vs DB → keyword pre-filter → LLM classify relevance → fetch bài pass →
// summarize bằng Claude Haiku → insert electricity_news (source_id = virtual "RSS Discovery").

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { DOMParser, Element } from "https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const FEED_FETCH_TIMEOUT_MS = 15000;
const ARTICLE_FETCH_TIMEOUT_MS = 20000;
const WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_CANDIDATES_PER_RUN = 30;        // trần bài gửi LLM classify/run (chi phí)
const MAX_INSERTS_PER_RUN = 15;           // trần bài summarize + insert/run
const MAX_CONTENT_CHARS = 8000;
const DISCOVERY_SOURCE_NAME = "RSS Discovery";

const FEEDS: { name: string; url: string }[] = [
  { name: "VnExpress - Kinh doanh",   url: "https://vnexpress.net/rss/kinh-doanh.rss" },
  { name: "VnExpress - Tin mới",      url: "https://vnexpress.net/rss/tin-moi-nhat.rss" },
  { name: "VnExpress - Khoa học",     url: "https://vnexpress.net/rss/khoa-hoc.rss" },
  { name: "Tuổi Trẻ - Kinh doanh",    url: "https://tuoitre.vn/rss/kinh-doanh.rss" },
  { name: "Tuổi Trẻ - Thời sự",       url: "https://tuoitre.vn/rss/thoi-su.rss" },
  { name: "Thanh Niên - Kinh tế",     url: "https://thanhnien.vn/rss/kinh-te.rss" },
  { name: "CafeF - Doanh nghiệp",     url: "https://cafef.vn/doanh-nghiep.rss" },
  { name: "CafeF - Chứng khoán",      url: "https://cafef.vn/thi-truong-chung-khoan.rss" },
  { name: "Dân Trí - Kinh doanh",     url: "https://dantri.com.vn/rss/kinh-doanh.rss" },
  { name: "Dân Trí - Sự kiện",        url: "https://dantri.com.vn/rss/su-kien.rss" },
  { name: "VnEconomy - Kinh tế",      url: "https://vneconomy.vn/kinh-te.rss" },
  { name: "VnEconomy - Tài chính",    url: "https://vneconomy.vn/tai-chinh.rss" },
  { name: "VnEconomy - Đầu tư",       url: "https://vneconomy.vn/dau-tu.rss" },
  { name: "VOV - Kinh tế",            url: "https://vov.vn/rss/kinh-te.rss" },
  { name: "VTC News - Kinh tế",       url: "https://vtcnews.vn/rss/kinh-te.rss" },
];

// Keyword pre-filter: loại ~94% bài không liên quan trước khi gọi LLM.
const KEYWORD_RE = /\b(EVN|BESS|điện(?!\s*(thoại|tử|ảnh|máy))|năng\s*lượng|điện\s*lực|điện\s*gió|điện\s*mặt\s*trời|điện\s*hạt\s*nhân|điện\s*sinh\s*khối|thủy\s*điện|nhiệt\s*điện|lưới\s*điện|cung\s*ứng\s*điện|giá\s*điện|tiết\s*kiệm\s*điện|pin\s*lưu\s*trữ|hydro\s*xanh|xe\s*điện|Bộ\s*Công\s*Thương|Cục\s*Điện\s*lực|NLTT)/i;

const CLASSIFY_SYSTEM_PROMPT = `Bạn phân loại tin tức cho trang tổng hợp ngành điện/năng lượng Việt Nam. Xác định bài có LIÊN QUAN hay không.

LIÊN QUAN (pass):
- Ngành điện VN: EVN, sản xuất/truyền tải/phân phối điện, giá điện, cung ứng điện, lưới điện, tiết kiệm điện, an ninh năng lượng
- Nguồn điện: điện gió, điện mặt trời, điện hạt nhân, thủy điện, nhiệt điện, sinh khối, LNG, khí
- Chính sách/pháp lý: luật điện lực, quy hoạch điện, chính sách năng lượng VN
- Xu hướng ngành toàn cầu ảnh hưởng VN: giá dầu/khí thế giới tác động điện VN, công nghệ BESS/hydrogen, chuỗi cung ứng NLTT quốc tế
- Hạ tầng năng lượng: LNG terminal, kho cảng, đường dây 500kV, trạm biến áp, nhà máy điện
- Chuyển đổi năng lượng xanh, giảm phát thải ngành điện

KHÔNG LIÊN QUAN (reject):
- Xe điện cá nhân/ô tô thương mại (Porsche, Tesla, VinFast sản phẩm), trạm sạc xe
- Thiết bị điện gia dụng, điện thoại, điện tử tiêu dùng
- Tài chính doanh nghiệp không liên quan điện (cổ tức, ĐHĐCĐ chung)
- Xăng dầu thuần (trừ khi gắn trực tiếp với điện/khí/LNG)
- Crypto/tiền điện tử, thời tiết thuần túy, showbiz, thể thao
- Giá USD/vàng, kinh tế vĩ mô không đề cập ngành điện
- Tin quốc tế không liên quan VN và không phải xu hướng ngành điện toàn cầu

LƯU Ý: Tin quốc tế về điện mặt trời/gió/hạt nhân toàn cầu VẪN pass. Dầu mỏ Trung Đông chỉ pass nếu bài bàn tác động giá điện/năng lượng.

TRẢ VỀ: MẢNG JSON thuần, không markdown. Mỗi phần tử: {"relevant": bool, "confidence": 0.0-1.0, "reason": "≤12 từ"}`;

const SUMMARIZE_SYSTEM_PROMPT = `Bạn là biên tập viên tin tức chuyên ngành điện Việt Nam. Nhiệm vụ: đọc bài báo và trả về JSON gồm ngày xuất bản + tóm tắt.

ĐỊNH DẠNG ĐẦU RA BẮT BUỘC (JSON thuần, không markdown, không giải thích):
{"published_date": "YYYY-MM-DD hoặc null", "summary": "..."}

QUY TẮC:
- published_date: ngày xuất bản bài. Dạng YYYY-MM-DD. Không đoán.
- summary: tóm tắt dưới 150 từ bằng tiếng Việt
  + Văn phong tin tức chuyên ngành, khách quan
  + Nêu rõ ngày (dd/mm/yyyy nếu có), chủ thể, sự kiện, kết quả
  + Không lặp lại tiêu đề, không mở đầu "Bài báo nói về…"`;

// ---------- Utilities ----------

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function canonicalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    u.hash = "";
    const keep = new URLSearchParams();
    u.searchParams.forEach((v, k) => {
      if (!k.startsWith("utm_") && k !== "fbclid" && k !== "gclid") keep.set(k, v);
    });
    u.search = keep.toString() ? `?${keep.toString()}` : "";
    let s = u.toString();
    if (s.endsWith("/")) s = s.slice(0, -1);
    return s;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, "Accept-Language": "vi,en;q=0.8" },
      redirect: "follow",
    });
  } finally {
    clearTimeout(t);
  }
}

function unescapeXml(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'").replace(/&nbsp;/g, " ");
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

interface RssItem {
  title: string;
  link: string;
  pubDate: string | null;
  description: string;
  feedName: string;
}

function parseRss(xml: string, feedName: string): RssItem[] {
  const items: RssItem[] = [];
  const matches = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const it of matches) {
    const pick = (tag: string) => {
      const m = it.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
      return m ? unescapeXml(m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim()) : "";
    };
    const title = pick("title");
    let link = pick("link");
    if (!link) {
      const g = it.match(/<guid[^>]*>([\s\S]*?)<\/guid>/);
      if (g) link = unescapeXml(g[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim());
    }
    const pubDate = pick("pubDate") || null;
    const description = stripHtml(pick("description"));
    if (link && title) items.push({ title, link, pubDate, description, feedName });
  }
  return items;
}

function extractPublishedDateFromHtml(html: string): string | null {
  const patterns: RegExp[] = [
    /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']article:published_time["']/i,
    /<meta[^>]+itemprop=["']datePublished["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+itemprop=["']datePublished["']/i,
    /<meta[^>]+name=["'](?:pubdate|publishdate|publish_date|date|DC\.date\.issued)["'][^>]+content=["']([^"']+)["']/i,
    /"datePublished"\s*:\s*"([^"]+)"/,
    /<time[^>]+datetime=["']([^"']+)["']/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) {
      const d = new Date(m[1]);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
  }
  return null;
}

function extractArticleContent(html: string): { title: string; content: string } {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) return { title: "", content: "" };
  const title =
    doc.querySelector("meta[property='og:title']")?.getAttribute("content") ||
    doc.querySelector("title")?.textContent ||
    doc.querySelector("h1")?.textContent || "";
  // Generic selectors — thử rộng vì đa nguồn.
  const selectors = [
    "article", "main article",
    "div.article-content", "div.article__body", "div.article-body",
    "div.news-detail", "div.detail-content", "div.content-detail",
    "div.fck_detail", "div.detail__content", "div.singular-content",
    "[class*='article-content']", "[class*='content-detail']",
    "main", "div.content",
  ];
  let contentEl: Element | null = null;
  for (const sel of selectors) {
    try {
      const el = doc.querySelector(sel) as Element | null;
      if (el && (el.textContent || "").length > 200) {
        contentEl = el;
        break;
      }
    } catch { /* bad selector, skip */ }
  }
  let content = "";
  if (contentEl) {
    contentEl.querySelectorAll("script, style, iframe, nav, footer, aside, .advertisement, .related-news, .box-tags, .author-info").forEach((n) => (n as Element).remove());
    content = contentEl.textContent || "";
  } else {
    const ps: string[] = [];
    doc.querySelectorAll("p").forEach((p) => {
      const t = (p.textContent || "").trim();
      if (t.length > 40) ps.push(t);
    });
    content = ps.join("\n");
  }
  content = content.replace(/\s+/g, " ").trim().slice(0, MAX_CONTENT_CHARS);
  return { title: (title || "").replace(/\s+/g, " ").trim(), content };
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

// ---------- LLM calls ----------

async function classifyBatch(
  items: RssItem[],
  apiKey: string,
): Promise<Array<{ relevant: boolean | null; confidence: number; reason: string }>> {
  const batchSize = 10;
  const out: Array<{ relevant: boolean | null; confidence: number; reason: string }> = [];

  for (let start = 0; start < items.length; start += batchSize) {
    const batch = items.slice(start, start + batchSize);
    const userMsg = `Phân loại ${batch.length} bài, trả MẢNG JSON ${batch.length} phần tử theo đúng thứ tự.\n\n`
      + batch.map((c, i) => `[${i}] TITLE: ${c.title}\nDESC: ${(c.description || "").slice(0, 180)}`).join("\n\n");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1500,
        system: CLASSIFY_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMsg }],
      }),
    });
    if (!res.ok) throw new Error(`classify HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const text: string = data?.content?.[0]?.text ?? "[]";
    const m = text.match(/\[[\s\S]*\]/);
    let parsed: unknown;
    try {
      parsed = JSON.parse(m?.[0] ?? text);
    } catch {
      parsed = batch.map(() => ({ relevant: null, confidence: 0, reason: "parse-fail" }));
    }
    const arr = Array.isArray(parsed) ? parsed : [];
    for (let i = 0; i < batch.length; i++) {
      const r = arr[i] as { relevant?: unknown; confidence?: unknown; reason?: unknown } | undefined;
      out.push({
        relevant: typeof r?.relevant === "boolean" ? r.relevant : null,
        confidence: typeof r?.confidence === "number" ? r.confidence : 0,
        reason: typeof r?.reason === "string" ? r.reason : "",
      });
    }
  }
  return out;
}

async function summarizeWithClaude(
  title: string,
  content: string,
  apiKey: string,
): Promise<{ summary: string; publishedDate: string | null }> {
  const userMsg = `Tiêu đề: ${title}\n\nNội dung:\n${content}`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 700,
      system: SUMMARIZE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMsg }],
    }),
  });
  if (!res.ok) throw new Error(`summarize HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const raw: string = (data?.content?.[0]?.text ?? "").trim();
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return { summary: raw, publishedDate: null };
  try {
    const p = JSON.parse(m[0]);
    const summary = String(p.summary ?? "").trim();
    const pd = p.published_date;
    const publishedDate = typeof pd === "string" && /^\d{4}-\d{2}-\d{2}$/.test(pd) ? pd : null;
    return { summary, publishedDate };
  } catch {
    return { summary: raw, publishedDate: null };
  }
}

// ---------- Main handler ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    return await handle();
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.error("uncaught:", msg, (e as Error)?.stack);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function handle(): Promise<Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  if (!anthropicKey) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  // Lấy virtual source "RSS Discovery"
  const { data: src, error: srcErr } = await supabase
    .from("electricity_sources")
    .select("id, name, category")
    .eq("name", DISCOVERY_SOURCE_NAME)
    .maybeSingle();
  if (srcErr || !src) {
    return new Response(JSON.stringify({ error: `Virtual source "${DISCOVERY_SOURCE_NAME}" not found. Run migration.` }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const stats = {
    feedsFetched: 0,
    feedsFailed: 0,
    totalItems: 0,
    afterWindow: 0,
    afterKeyword: 0,
    classified: 0,
    relevant: 0,
    inserted: 0,
    errors: [] as string[],
  };

  // 1. Fetch all RSS feeds in parallel
  const fetchResults = await Promise.allSettled(
    FEEDS.map(async (f) => {
      const r = await fetchWithTimeout(f.url, FEED_FETCH_TIMEOUT_MS);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return parseRss(await r.text(), f.name);
    }),
  );
  const allItems: RssItem[] = [];
  for (let i = 0; i < FEEDS.length; i++) {
    const res = fetchResults[i];
    if (res.status === "fulfilled") {
      stats.feedsFetched++;
      allItems.push(...res.value);
    } else {
      stats.feedsFailed++;
      stats.errors.push(`feed ${FEEDS[i].name}: ${(res.reason as Error)?.message ?? "?"}`);
    }
  }
  stats.totalItems = allItems.length;

  // 2. Window + dedupe by URL
  const now = Date.now();
  const byUrl = new Map<string, RssItem>();
  for (const it of allItems) {
    const pubMs = it.pubDate ? Date.parse(it.pubDate) : NaN;
    if (!isNaN(pubMs) && now - pubMs > WINDOW_MS) continue;
    const canon = canonicalizeUrl(it.link);
    if (!canon) continue;
    if (!byUrl.has(canon)) byUrl.set(canon, { ...it, link: canon });
  }
  stats.afterWindow = byUrl.size;

  // 3. Keyword pre-filter
  let keywordPass: RssItem[] = [];
  for (const it of byUrl.values()) {
    if (KEYWORD_RE.test(`${it.title} ${it.description}`)) keywordPass.push(it);
  }
  stats.afterKeyword = keywordPass.length;
  keywordPass.sort((a, b) => (Date.parse(b.pubDate || "") || 0) - (Date.parse(a.pubDate || "") || 0));

  // 4. Dedupe vs DB (url_hash)
  const urlHashMap = new Map<string, string>();
  for (const it of keywordPass) urlHashMap.set(it.link, await sha256Hex(it.link));
  const hashes = Array.from(urlHashMap.values());
  if (hashes.length > 0) {
    const { data: existing } = await supabase
      .from("electricity_news")
      .select("url_hash")
      .in("url_hash", hashes);
    const existingSet = new Set((existing ?? []).map((r) => r.url_hash as string));
    keywordPass = keywordPass.filter((it) => !existingSet.has(urlHashMap.get(it.link)!));
  }

  // 5. Cap + LLM classify
  const toClassify = keywordPass.slice(0, MAX_CANDIDATES_PER_RUN);
  if (toClassify.length === 0) {
    return new Response(JSON.stringify({ ok: true, stats, note: "no new candidates after dedupe" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const classifications = await classifyBatch(toClassify, anthropicKey);
  stats.classified = classifications.length;
  const relevant = toClassify.filter((_, i) => classifications[i].relevant === true);
  stats.relevant = relevant.length;

  // 6. Fetch + summarize + insert (parallel 3)
  const toInsert = relevant.slice(0, MAX_INSERTS_PER_RUN);
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;

  const processOne = async (it: RssItem) => {
    try {
      const artRes = await fetchWithTimeout(it.link, ARTICLE_FETCH_TIMEOUT_MS);
      if (!artRes.ok) {
        stats.errors.push(`${it.feedName}: HTTP ${artRes.status}`);
        return;
      }
      const html = await artRes.text();
      const { title: extractedTitle, content } = extractArticleContent(html);
      const title = it.title || extractedTitle;
      if (!content || content.length < 200) {
        stats.errors.push(`${it.feedName}: content too short (${content.length})`);
        return;
      }
      const metaDate = extractPublishedDateFromHtml(html);
      const rssDate = it.pubDate ? new Date(it.pubDate).toISOString() : null;
      const preDate = metaDate ?? rssDate;
      if (preDate) {
        const age = now - new Date(preDate).getTime();
        if (age > threeDaysMs) {
          stats.errors.push(`${it.feedName}: bài cũ (${preDate.slice(0, 10)})`);
          return;
        }
      }

      const { summary, publishedDate } = await summarizeWithClaude(title, content, anthropicKey);
      if (!summary) {
        stats.errors.push(`${it.feedName}: Claude empty summary`);
        return;
      }
      const llmIso = publishedDate ? `${publishedDate}T00:00:00Z` : null;
      const publishedAt = preDate ?? llmIso;
      if (!publishedAt) {
        stats.errors.push(`${it.feedName}: no published date`);
        return;
      }
      const age = now - new Date(publishedAt).getTime();
      if (age > threeDaysMs) {
        stats.errors.push(`${it.feedName}: bài cũ (${publishedAt.slice(0, 10)})`);
        return;
      }

      // Host làm source_name phụ (để dashboard group theo domain)
      let host = "";
      try { host = new URL(it.link).host.replace(/^www\./, ""); } catch { /* ignore */ }
      const displayName = host ? `${src.name} (${host})` : src.name;

      const { error: insErr } = await supabase.from("electricity_news").insert({
        source_id: src.id,
        source_name: displayName,
        source_category: src.category,
        title,
        summary,
        original_url: it.link,
        url_hash: urlHashMap.get(it.link)!,
        published_at: publishedAt,
        summary_word_count: wordCount(summary),
      });
      if (insErr) {
        if (!String(insErr.message).includes("duplicate")) {
          stats.errors.push(`${it.feedName}: insert ${insErr.message}`);
        }
      } else {
        stats.inserted++;
      }
    } catch (e) {
      stats.errors.push(`${it.feedName}: ${(e as Error).message}`);
    }
  };

  // Concurrency 3
  const queue = [...toInsert];
  const workers = Array.from({ length: 3 }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (!item) return;
      await processOne(item);
    }
  });
  await Promise.all(workers);

  // Update last_crawled_at on virtual source
  await supabase
    .from("electricity_sources")
    .update({ last_crawled_at: new Date().toISOString(), consecutive_failures: 0, last_error: null })
    .eq("id", src.id);

  return new Response(JSON.stringify({ ok: true, stats }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
