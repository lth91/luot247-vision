// AI crawl tin tổng hợp từ RSS báo lớn VN → Haiku viết lại chuẩn luot247
// (tiêu đề 12-18 từ, tổng 120-140 từ) → insert bảng news với is_approved=false,
// review_status='pending' — nhân viên duyệt tay ở /duyet-tin-ai.
// Port từ crawl-electricity-news (f1ac097), bỏ keyword điện, đổi đích ghi.
//
// Modes (body JSON):
//   {}                        — cron/manual: crawl SOURCES_PER_RUN nguồn cũ nhất
//   {"source_id": "<uuid>"}   — retry 1 nguồn (bỏ filter is_active)
//   {"mode": "check_sources"} — KHÔNG gọi LLM: fetch mọi nguồn active, báo
//                               http status + số item parse được (verify feed
//                               từ chính egress của Supabase).
//   {"max_llm_calls": N}      — override trần LLM mỗi run (mặc định 35)

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { DOMParser, Element } from "https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts";
import { logLlmUsage } from "../_shared/llm-usage.ts";
import { isValidCategory } from "../_shared/news-categories.ts";
import { CRAWL_SYSTEM_PROMPT } from "../_shared/crawl-summary-prompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const SOURCE_CONCURRENCY = 3;
const SOURCES_PER_RUN = 15;
const TIME_BUDGET_MS = 120000;
const FETCH_TIMEOUT_MS = 30000;
const MAX_CONTENT_CHARS = 6000; // 140 từ output không cần hơn 6k chars input
const DEFAULT_MAX_LLM_CALLS = 35; // van chống vọt chi phí mỗi run
const MAX_ARTICLE_AGE_MS = 3 * 24 * 60 * 60 * 1000;

// Chuẩn độ dài (khớp submit-news + SubmitNews.tsx)
const TITLE_MIN = 12, TITLE_MAX = 18, TOTAL_MIN = 120, TOTAL_MAX = 140;

// URL noise filter rẻ tiền (pre-LLM): trang không phải bài viết text.
const URL_NOISE_RE = /\/(video|videos|podcast|podcasts|photo|photos|anh-|infographics?|interactive|quiz|lich-truyen-hinh|lich-chieu|tu-vi|xo-so|ket-qua-xo-so)[\/-]|\.(mp4|mp3)$/i;

function maxArticlesFor(tier: number | null): number {
  if (tier === 1) return 15;
  if (tier === 2) return 10;
  return 8;
}

interface Source {
  id: string;
  name: string;
  base_url: string;
  list_url: string;
  feed_type: "rss" | "html_list";
  list_link_pattern: string | null;
  article_content_selector: string | null;
  default_category: string;
  tier: number | null;
  consecutive_failures: number;
}

async function fetchWithTimeout(url: string, ms = FETCH_TIMEOUT_MS): Promise<Response> {
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

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function canonicalizeUrl(rawUrl: string, base: string): string | null {
  try {
    const u = new URL(rawUrl, base);
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

function extractLinks(html: string, source: Source): string[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) return [];
  const pattern = source.list_link_pattern ? new RegExp(source.list_link_pattern, "i") : null;
  const urls = new Set<string>();
  doc.querySelectorAll("a[href]").forEach((a) => {
    const href = (a as Element).getAttribute("href");
    if (!href) return;
    const abs = canonicalizeUrl(href, source.base_url);
    if (!abs) return;
    if (pattern && !pattern.test(abs)) return;
    if (abs === source.list_url) return;
    try {
      if (new URL(abs).host !== new URL(source.base_url).host) return;
    } catch {
      return;
    }
    urls.add(abs);
  });
  return Array.from(urls).slice(0, maxArticlesFor(source.tier));
}

function extractRssItems(xml: string, max: number): { url: string; title: string; pubDate: string | null }[] {
  const items: { url: string; title: string; pubDate: string | null }[] = [];
  const matches = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const it of matches) {
    const link =
      it.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i)?.[1]?.trim();
    const title = it.match(/<title(?:\s[^>]*)?>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1]?.trim();
    const pub = it.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1]?.trim() ?? null;
    if (link && title) items.push({ url: link, title, pubDate: pub });
    if (items.length >= max) break;
  }
  return items;
}

function stripHtml(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function extractArticleContent(html: string, selectorList: string | null): { title: string; content: string } {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) return { title: "", content: "" };
  const title =
    doc.querySelector("meta[property='og:title']")?.getAttribute("content") ||
    doc.querySelector("title")?.textContent ||
    doc.querySelector("h1")?.textContent ||
    "";
  const selectors = (selectorList || "article, div.content").split(",").map((s) => s.trim()).filter(Boolean);
  let contentEl: Element | null = null;
  for (const sel of selectors) {
    try {
      contentEl = doc.querySelector(sel) as Element | null;
      if (contentEl) break;
    } catch {
      // selector không hợp lệ, bỏ qua
    }
  }
  let content = "";
  if (contentEl) {
    contentEl.querySelectorAll("script, style, iframe, nav, footer, aside, .advertisement, .related-news, .box-related, .related-articles, .sidebar, .VCSortableInPreviewMode").forEach((n) => (n as Element).remove());
    content = contentEl.textContent || "";
  } else {
    const ogDesc = doc.querySelector("meta[property='og:description']")?.getAttribute("content") || "";
    const metaDesc = doc.querySelector("meta[name='description']")?.getAttribute("content") || "";
    const desc = (ogDesc.length > metaDesc.length ? ogDesc : metaDesc).trim();
    if (desc.length > 150) content = desc;
    if (content.length < 300) {
      const mainEl = doc.querySelector("main") || doc.querySelector("article") || doc.body;
      const ps: string[] = [];
      mainEl?.querySelectorAll("p").forEach((p) => {
        const t = (p.textContent || "").trim();
        if (t.length > 40) ps.push(t);
      });
      content = ps.join("\n");
    }
  }
  content = stripHtml(content).slice(0, MAX_CONTENT_CHARS);
  return { title: stripHtml(title), content };
}

function parseRssDate(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
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
    if (m && m[1]) {
      const d = new Date(m[1]);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
  }
  const dmyHm = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\s*[-–]\s*(\d{1,2}):(\d{2})\b/;
  const hmDmy = /\b(\d{1,2}):(\d{2}),?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\b/;
  let day: number | null = null, month: number | null = null, year: number | null = null,
    hour: number | null = null, minute: number | null = null;
  const m1 = html.match(dmyHm);
  if (m1) {
    day = +m1[1]; month = +m1[2]; year = +m1[3]; hour = +m1[4]; minute = +m1[5];
  } else {
    const m2 = html.match(hmDmy);
    if (m2) {
      hour = +m2[1]; minute = +m2[2]; day = +m2[3]; month = +m2[4]; year = +m2[5];
    }
  }
  if (year !== null && month !== null && day !== null && hour !== null && minute !== null) {
    if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const pad = (n: number) => String(n).padStart(2, "0");
      const iso = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00+07:00`;
      const d = new Date(iso);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
  }
  return null;
}

function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

interface LlmResult {
  is_news: boolean;
  reject_reason: string;
  category: string;
  category_confidence: number;
  title: string;
  content: string;
  published_date: string | null;
  flags: { is_ad?: boolean; missing_facts?: boolean; is_sensational?: boolean; legal_risk?: boolean };
}

function parseLlmJson(raw: string): LlmResult | null {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  const tryParse = (s: string) => { try { return JSON.parse(s) as Record<string, unknown>; } catch { return null; } };
  const parsed = tryParse(cleaned)
    ?? tryParse(cleaned.match(/\{[\s\S]*\}/)?.[0] ?? "");
  if (!parsed || typeof parsed !== "object") return null;
  const pd = parsed.published_date;
  return {
    is_news: parsed.is_news !== false,
    reject_reason: String(parsed.reject_reason ?? ""),
    category: String(parsed.category ?? ""),
    category_confidence: Number(parsed.category_confidence ?? 0),
    title: String(parsed.title ?? "").trim(),
    content: String(parsed.content ?? "").trim(),
    published_date: typeof pd === "string" && /^\d{4}-\d{2}-\d{2}$/.test(pd) ? pd : null,
    flags: (parsed.flags && typeof parsed.flags === "object" ? parsed.flags : {}) as LlmResult["flags"],
  };
}

// Gọi Haiku viết lại + phân loại. extraFeedback dùng cho retry khi lệch số từ.
async function rewriteWithClaude(
  origTitle: string,
  content: string,
  dateHint: string | null,
  apiKey: string,
  supabase: SupabaseClient,
  extraFeedback = "",
): Promise<LlmResult | null> {
  const hint = dateHint
    ? `\n\nNgày xuất bản đã xác định từ metadata: ${dateHint}. Dùng đúng mốc này.`
    : "";
  const userMsg = `Tiêu đề gốc: ${origTitle}\n\nNội dung bài gốc:\n${content}${hint}${extraFeedback}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 900,
      temperature: 0.3,
      // System prompt ~6k token tĩnh → cache 5' (ngưỡng Haiku 4096 đã vượt).
      system: [{ type: "text", text: CRAWL_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMsg }],
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Anthropic ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  if (data?.usage) {
    await logLlmUsage(supabase, { functionName: "crawl-news", model: ANTHROPIC_MODEL, usage: data.usage });
  }
  return parseLlmJson((data?.content?.[0]?.text ?? "").trim());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    return await handle(req);
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.error("uncaught:", msg, (e as Error)?.stack);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function handle(req: Request): Promise<Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  const supabase = createClient(supabaseUrl, serviceKey);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* cron gọi không body */ }
  const forcedSourceId = body?.source_id ? String(body.source_id) : null;
  const maxLlmCalls = Number(body?.max_llm_calls) > 0 ? Number(body.max_llm_calls) : DEFAULT_MAX_LLM_CALLS;

  // ===== MODE: check_sources — verify feed từ egress Supabase, không LLM =====
  if (body?.mode === "check_sources") {
    const { data: sources, error } = await supabase
      .from("crawl_sources").select("*").eq("is_active", true).order("name");
    if (error) return json({ error: error.message }, 500);
    const results: unknown[] = [];
    const list = (sources as Source[]) ?? [];
    for (let i = 0; i < list.length; i += 6) {
      const batch = list.slice(i, i + 6);
      const rs = await Promise.all(batch.map(async (src) => {
        try {
          const r = await fetchWithTimeout(src.list_url, 15000);
          const bodyTxt = await r.text();
          const items = src.feed_type === "rss"
            ? extractRssItems(bodyTxt, 50).length
            : extractLinks(bodyTxt, src).length;
          return { name: src.name, url: src.list_url, http: r.status, items, ok: r.ok && items > 0 };
        } catch (e) {
          return { name: src.name, url: src.list_url, http: 0, items: 0, ok: false, error: (e as Error).message.slice(0, 120) };
        }
      }));
      results.push(...rs);
    }
    const bad = (results as { ok: boolean }[]).filter((r) => !r.ok).length;
    return json({ ok: true, mode: "check_sources", total: results.length, bad, results });
  }

  // ===== MODE: crawl =====
  if (!anthropicKey) return json({ error: "ANTHROPIC_API_KEY chưa được set" }, 500);

  let query = supabase.from("crawl_sources").select("*").eq("is_active", true)
    .like("list_url", "http%")
    .order("last_crawled_at", { ascending: true, nullsFirst: true })
    .limit(SOURCES_PER_RUN);
  if (forcedSourceId) {
    query = supabase.from("crawl_sources").select("*").eq("id", forcedSourceId);
  }
  const { data: sources, error: sErr } = await query;
  if (sErr) return json({ error: sErr.message }, 500);

  const stats = {
    sources: 0, articlesFound: 0, llmCalls: 0, inserted: 0,
    skippedDup: 0, skippedOld: 0, rejectedNonNews: 0, needsEdit: 0,
    errors: [] as string[],
  };
  let llmCalls = 0;
  const startTime = Date.now();

  const processSource = async (src: Source) => {
    stats.sources++;
    try {
      const listRes = await fetchWithTimeout(src.list_url);
      if (!listRes.ok) throw new Error(`list HTTP ${listRes.status}`);
      const listBody = await listRes.text();

      let candidates: { url: string; title?: string; pubDate?: string | null }[] = [];
      if (src.feed_type === "rss") {
        candidates = extractRssItems(listBody, maxArticlesFor(src.tier));
      } else {
        candidates = extractLinks(listBody, src).map((u) => ({ url: u }));
      }
      // Loại trang không phải bài viết (video/podcast/tử vi...) — rẻ, trước mọi thứ.
      candidates = candidates.filter((c) => !URL_NOISE_RE.test(c.url));
      stats.articlesFound += candidates.length;

      if (candidates.length === 0) {
        const newFails = src.consecutive_failures + 1;
        await supabase.from("crawl_sources").update({
          last_crawled_at: new Date().toISOString(),
          consecutive_failures: newFails,
          last_error: `no candidates parsed from ${src.feed_type} list`,
          is_active: newFails < 10,
        }).eq("id", src.id);
        stats.errors.push(`${src.name}: 0 candidates (fails=${newFails})`);
        return;
      }

      for (const c of candidates) {
        if (Date.now() - startTime > TIME_BUDGET_MS) break;
        if (llmCalls >= maxLlmCalls) break;

        const canonical = canonicalizeUrl(c.url, src.base_url);
        if (!canonical) continue;
        const hash = await sha256Hex(canonical);

        // Dedup lớp 1: URL đã crawl/đã đăng (news.url_hash unique, chung với tin gửi tay).
        const { data: exists } = await supabase.from("news").select("id").eq("url_hash", hash).maybeSingle();
        if (exists) { stats.skippedDup++; continue; }

        try {
          // Bài quá cũ theo RSS pubDate → bỏ trước khi fetch.
          const rssDate = parseRssDate(c.pubDate ?? null);
          if (rssDate && Date.now() - new Date(rssDate).getTime() > MAX_ARTICLE_AGE_MS) {
            stats.skippedOld++; continue;
          }

          // Dedup lớp 2: trigram với tiêu đề GỐC (tin nhân viên vừa gửi / báo khác
          // cùng sự kiện đã crawl). RPC trả id tin giống nhất hoặc null.
          if (c.title) {
            const { data: simId } = await supabase.rpc("find_similar_news_title", {
              _title: c.title, _threshold: 0.7,
            });
            if (simId) { stats.skippedDup++; continue; }
          }

          const artRes = await fetchWithTimeout(canonical);
          if (!artRes.ok) { stats.errors.push(`${src.name}: article HTTP ${artRes.status}`); continue; }
          const artHtml = await artRes.text();
          const { title: htmlTitle, content } = extractArticleContent(artHtml, src.article_content_selector);
          if (!content || content.length < 200) {
            stats.errors.push(`${src.name}: nội dung quá ngắn (${content.length}) — ${canonical.slice(0, 80)}`);
            continue;
          }
          const origTitle = (c.title || htmlTitle || "").trim() || "(Không có tiêu đề)";

          // Ngày xuất bản: meta HTML > RSS. STRICT — không có ngày thì bỏ.
          const metaDate = extractPublishedDateFromHtml(artHtml);
          const publishedAt = metaDate ?? rssDate;
          if (!publishedAt) { stats.skippedOld++; continue; }
          if (Date.now() - new Date(publishedAt).getTime() > MAX_ARTICLE_AGE_MS) {
            stats.skippedOld++; continue;
          }

          // LLM viết lại + phân loại (1 call; retry 1 lần nếu lệch số từ).
          llmCalls++; stats.llmCalls++;
          let r = await rewriteWithClaude(origTitle, content, publishedAt.slice(0, 10), anthropicKey, supabase);
          if (!r) { stats.errors.push(`${src.name}: LLM trả về không parse được`); continue; }
          if (!r.is_news) { stats.rejectedNonNews++; continue; }

          let tw = countWords(r.title), total = tw + countWords(r.content);
          let needsEdit = false;
          if (tw < TITLE_MIN || tw > TITLE_MAX || total < TOTAL_MIN || total > TOTAL_MAX) {
            if (llmCalls < maxLlmCalls) {
              llmCalls++; stats.llmCalls++;
              const fb = `\n\nLƯU Ý RETRY: bản trước có tiêu đề ${tw} từ, tổng ${total} từ — KHÔNG đạt chuẩn (tiêu đề ${TITLE_MIN}-${TITLE_MAX}, tổng ${TOTAL_MIN}-${TOTAL_MAX}). Viết lại và ĐẾM KỸ số từ.`;
              const r2 = await rewriteWithClaude(origTitle, content, publishedAt.slice(0, 10), anthropicKey, supabase, fb);
              if (r2 && r2.is_news && r2.title && r2.content) r = r2;
            }
            tw = countWords(r.title); total = tw + countWords(r.content);
            if (tw < TITLE_MIN || tw > TITLE_MAX || total < TOTAL_MIN || total > TOTAL_MAX) {
              needsEdit = true; // vẫn đưa vào hàng đợi, nhân viên sửa lúc duyệt
            }
          }
          if (!r.title || !r.content) { stats.errors.push(`${src.name}: LLM thiếu title/content`); continue; }

          // Dedup lớp 3: trigram với tiêu đề MỚI (viết lại có thể trùng tin đã có).
          const { data: simId2 } = await supabase.rpc("find_similar_news_title", {
            _title: r.title, _threshold: 0.7,
          });
          if (simId2) { stats.skippedDup++; continue; }

          const category = isValidCategory(r.category) ? r.category : src.default_category;
          const { error: insErr } = await supabase.from("news").insert({
            title: r.title,
            description: r.content,
            url: canonical,
            url_hash: hash,
            category,
            is_approved: false,
            review_status: "pending",
            submitted_by: null,
            ai_classification: {
              source: "ai_crawler",
              source_id: src.id,
              source_name: src.name,
              source_tier: src.tier,
              model: ANTHROPIC_MODEL,
              category_confidence: r.category_confidence,
              flags: r.flags,
              needs_edit: needsEdit,
              original_title: origTitle,
              published_at_source: publishedAt,
              title_words: tw,
              total_words: total,
            },
          });
          if (insErr) {
            if (!String(insErr.message).includes("duplicate")) {
              stats.errors.push(`${src.name}: insert ${insErr.message}`);
            } else {
              stats.skippedDup++;
            }
          } else {
            stats.inserted++;
            if (needsEdit) stats.needsEdit++;
          }
        } catch (e) {
          stats.errors.push(`${src.name}: ${(e as Error).message}`);
        }
      }

      await supabase.from("crawl_sources").update({
        last_crawled_at: new Date().toISOString(),
        consecutive_failures: 0,
        last_error: null,
      }).eq("id", src.id);
    } catch (e) {
      const msg = (e as Error).message;
      stats.errors.push(`${src.name}: ${msg}`);
      const newFails = src.consecutive_failures + 1;
      await supabase.from("crawl_sources").update({
        last_crawled_at: new Date().toISOString(),
        consecutive_failures: newFails,
        last_error: msg.slice(0, 500),
        is_active: newFails < 10,
      }).eq("id", src.id);
    }
  };

  const srcList = (sources as Source[]) ?? [];
  for (let i = 0; i < srcList.length; i += SOURCE_CONCURRENCY) {
    if (Date.now() - startTime > TIME_BUDGET_MS) {
      stats.errors.push(`time budget reached at source ${i}/${srcList.length}`);
      break;
    }
    if (llmCalls >= maxLlmCalls) {
      stats.errors.push(`max_llm_calls ${maxLlmCalls} reached at source ${i}/${srcList.length}`);
      break;
    }
    const batch = srcList.slice(i, i + SOURCE_CONCURRENCY);
    await Promise.all(batch.map(processSource));
  }

  const runMs = Date.now() - startTime;
  console.log(JSON.stringify({ run_ms: runMs, ...stats, errors_count: stats.errors.length, first_errors: stats.errors.slice(0, 5) }));
  return json({ ok: true, run_ms: runMs, ...stats });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
