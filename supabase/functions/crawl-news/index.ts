// AI crawl tin tổng hợp từ RSS báo lớn VN → Haiku viết lại chuẩn luot247
// (tiêu đề 12-18 từ, tổng 100-120 từ) → insert bảng news với is_approved=false,
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
import { countWords } from "../_shared/word-count.ts";
import { isValidCategory } from "../_shared/news-categories.ts";
import { CRAWL_SYSTEM_PROMPT } from "../_shared/crawl-summary-prompt.ts";
import { PRE_DUP_SYSTEM_PROMPT, VERIFY_SYSTEM_PROMPT } from "../_shared/crawl-verify-prompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const SOURCE_CONCURRENCY = 2; // 3 → 2: mỗi parse deno_dom giữ cả DOM trong RAM, 3 luồng song song từng làm vượt trần 256MB
const SOURCES_PER_RUN = 15;
const TIME_BUDGET_MS = 120000;
const FETCH_TIMEOUT_MS = 30000;
const MAX_CONTENT_CHARS = 6000; // 140 từ output không cần hơn 6k chars input
// Trần kích thước HTML đưa vào DOMParser (WASM): trang báo VN nặng 1-3MB,
// DOM phình ~10x → "Memory limit exceeded". Nội dung bài luôn nằm trong 1.5MB đầu.
const MAX_HTML_CHARS = 1_500_000;
const DEFAULT_MAX_LLM_CALLS = 60; // van chống vọt chi phí mỗi run (mỗi bài giờ ~2 cú: viết + giám khảo P1)
const MAX_ARTICLE_AGE_MS = 3 * 24 * 60 * 60 * 1000;

// Chuẩn độ dài TIN TỰ ĐỘNG (sếp 16/07): tổng title+content 100-120 từ.
// (Tin nhân viên gõ tay ở submit-news vẫn giữ chuẩn riêng 120-140.)
const TITLE_MIN = 12, TITLE_MAX = 18, TOTAL_MIN = 100, TOTAL_MAX = 120;

// Ngưỡng trùng tin (luật P1 sếp 17/07): điểm tương đồng CHỈ để chọn tin cần
// đối chiếu, KHÔNG tự động loại dù cao — mọi ca đều do AI phán "cùng sự kiện".
// >= SIM_BLOCK: nghi nặng → KIỂM TRÙNG SỚM trên bài gốc trước khi tốn cú viết
// (tiết kiệm 18/07); SIM_GRAY..SIM_BLOCK: viết xong giám khảo P1 phán.
const SIM_GRAY = 0.45, SIM_BLOCK = 0.70;

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



// Chuẩn hiển thị theo yêu cầu sếp 15/07: tiêu đề VIẾT HOA, nội dung 2 khổ.
// toUpperCase của JS xử lý đúng tiếng Việt có dấu (đ→Đ, ơ→Ơ...).
function formatTitle(s: string): string {
  // HOA toàn bộ + BỎ dấu hai chấm (sếp 16/07: tiêu đề không dùng ":"). Giữ ":"
  // giữa 2 chữ số (giờ 15:30, tỉ số 2:1); colon phân tách "X: Y" → thay space.
  return s
    .replace(/(?<!\d):(?!\d)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

// Tin AI = 1 KHỔ (sếp 16/07): gộp mọi xuống dòng thành 1 đoạn liền mạch.
// (Tin nhân viên gõ tay mới cần 2 khổ — xử lý ở submit-news.)
function flattenToOneParagraph(content: string): string {
  return content.replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim();
}

// Haiku hay viết lố vài chục từ dù prompt đã ép — cắt NGUYÊN CÂU từ cuối lên
// cho tới khi tổng (title+content) lọt trần. Câu cuối bản tin thường là chi
// tiết phụ nên cắt được; nếu cắt xong tụt dưới sàn thì trả nguyên bản để
// caller retry/needs_edit.
function trimToFit(title: string, content: string): string {
  const tw = countWords(title);
  if (tw + countWords(content) <= TOTAL_MAX) return content;
  const sentences = content.split(/(?<=[.!?…])\s+/);
  const kept = [...sentences];
  while (kept.length > 1 && tw + countWords(kept.join(" ")) > TOTAL_MAX) {
    kept.pop();
  }
  const trimmed = kept.join(" ");
  const total = tw + countWords(trimmed);
  if (total >= TOTAL_MIN && total <= TOTAL_MAX) return trimmed;

  // Cắt nguyên câu bị "quá đà" (câu dài 25-30 từ, cửa sổ chuẩn chỉ rộng 20 từ
  // nên dễ nhảy từ vượt trần xuống dưới sàn): lấy lại câu vừa bỏ, thử bỏ dần
  // VẾ PHỤ sau dấu phẩy cuối cho tới khi tổng lọt cửa sổ, chốt bằng dấu chấm.
  if (total < TOTAL_MIN && kept.length < sentences.length) {
    const clauses = sentences[kept.length].split(/,\s*/);
    for (let n = clauses.length - 1; n >= 1; n--) {
      const partial = clauses.slice(0, n).join(", ").replace(/[,.;:…\s]+$/, "") + ".";
      const candidate = `${trimmed} ${partial}`;
      const t = tw + countWords(candidate);
      if (t > TOTAL_MAX) continue;
      return t >= TOTAL_MIN ? candidate : content;
    }
  }
  return content;
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

interface SimilarHit { id: string; title: string; sim: number; created_at?: string }

// Tìm tin ĐÃ XUẤT BẢN giống nhất kèm điểm similarity (luật P1: chỉ đối chiếu
// với tin đã đăng, tin trong hàng đợi không tính — 2 bản trùng được phép cùng
// chờ, lượt lọc 2 lúc bấm Duyệt sẽ chặn). Fallback bậc thang khi migration
// chưa chạy: RPC cũ quét mọi tin → RPC cổ chỉ trả id ở ngưỡng SIM_BLOCK.
async function findSimilarPublished(
  supabase: SupabaseClient,
  title: string,
): Promise<SimilarHit | null> {
  const { data, error } = await supabase.rpc("find_similar_published_scored", {
    _title: title, _threshold: SIM_GRAY,
  });
  if (!error) {
    const row = (Array.isArray(data) ? data[0] : data) as SimilarHit | undefined;
    return row ? { id: row.id, title: row.title, sim: Number(row.sim), created_at: row.created_at } : null;
  }
  const { data: d2, error: e2 } = await supabase.rpc("find_similar_news_scored", {
    _title: title, _threshold: SIM_GRAY,
  });
  if (!e2) {
    const row = (Array.isArray(d2) ? d2[0] : d2) as SimilarHit | undefined;
    return row ? { id: row.id, title: row.title, sim: Number(row.sim) } : null;
  }
  const { data: simId } = await supabase.rpc("find_similar_news_title", {
    _title: title, _threshold: SIM_BLOCK,
  });
  return simId ? { id: simId as string, title: "", sim: SIM_BLOCK } : null;
}

// Hồ sơ tin bị loại (sếp yêu cầu lưu lý do cho quản lý tra). Best-effort —
// bảng chưa tạo (migration chưa chạy) thì bỏ qua, không chặn pipeline.
async function logReject(supabase: SupabaseClient, row: Record<string, unknown>): Promise<void> {
  try { await supabase.from("crawl_reject_log").insert(row); } catch { /* ignore */ }
}

// KIỂM TRÙNG SỚM: ca nghi trùng nặng (>= SIM_BLOCK) hỏi AI trên BÀI GỐC trước
// khi tốn cú viết. Trả null khi lỗi/parse fail → cứ viết như thường (fail-open).
async function preVerifyDup(
  origTitle: string,
  origContent: string,
  suspect: SimilarHit,
  apiKey: string,
  supabase: SupabaseClient,
): Promise<{ verdict: "trung" | "khac" | "dien_bien_moi"; reason: string } | null> {
  const userMsg = `BÀI BÁO GỐC\nTiêu đề: ${origTitle}\nNội dung:\n${origContent.slice(0, 3000)}\n\nTIN ĐÃ ĐĂNG TRÊN TRANG (điểm tương đồng ${Math.round(suspect.sim * 100)}%${suspect.created_at ? `, đăng lúc ${suspect.created_at.slice(0, 16).replace("T", " ")}` : ""}):\n«${suspect.title}»`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 150,
      temperature: 0,
      system: [{ type: "text", text: PRE_DUP_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMsg }],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (data?.usage) {
    await logLlmUsage(supabase, { functionName: "crawl-news", model: ANTHROPIC_MODEL, usage: data.usage });
  }
  const raw = (data?.content?.[0]?.text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  try {
    const p = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? raw) as Record<string, unknown>;
    const v = String(p.verdict ?? "");
    if (!["trung", "khac", "dien_bien_moi"].includes(v)) return null;
    return { verdict: v as "trung" | "khac" | "dien_bien_moi", reason: String(p.reason ?? "").slice(0, 200) };
  } catch {
    return null;
  }
}

interface VerifyResult { verdict: "dat" | "loai" | "trung" | "dien_bien_moi" | "can_kiem_tra"; reason: string; new_info: string }

// GIÁM KHẢO P1 (lượt kiểm 1): đối chiếu bản tin đã viết với bài gốc + phán
// trùng với tin đã đăng. Cú gọi AI thứ 2 cho mỗi bài (sếp duyệt chi 17/07).
async function verifyWithClaude(
  origTitle: string,
  origContent: string,
  newsTitle: string,
  newsContent: string,
  suspect: SimilarHit | null,
  apiKey: string,
  supabase: SupabaseClient,
): Promise<VerifyResult | null> {
  const dupBlock = suspect && suspect.title
    ? `\n\nTIN ĐÃ ĐĂNG NGHI TRÙNG (điểm tương đồng ${Math.round(suspect.sim * 100)}%${suspect.created_at ? `, đăng lúc ${suspect.created_at.slice(0, 16).replace("T", " ")}` : ""}):\n«${suspect.title}»`
    : "";
  const userMsg = `BÀI BÁO GỐC\nTiêu đề: ${origTitle}\nNội dung:\n${origContent.slice(0, 4000)}\n\nBẢN TIN ĐÃ VIẾT\nTiêu đề: ${newsTitle}\nNội dung: ${newsContent}${dupBlock}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 300,
      temperature: 0,
      system: [{ type: "text", text: VERIFY_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMsg }],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (data?.usage) {
    await logLlmUsage(supabase, { functionName: "crawl-news", model: ANTHROPIC_MODEL, usage: data.usage });
  }
  const raw = (data?.content?.[0]?.text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  try {
    const p = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? raw) as Record<string, unknown>;
    const v = String(p.verdict ?? "");
    if (!["dat", "loai", "trung", "dien_bien_moi", "can_kiem_tra"].includes(v)) return null;
    return {
      verdict: v as VerifyResult["verdict"],
      reason: String(p.reason ?? "").slice(0, 300),
      new_info: String(p.new_info ?? "").slice(0, 200),
    };
  } catch {
    return null;
  }
}

// Gọi Haiku viết lại + phân loại (P3 thuần viết — kiểm trùng do giám khảo P1
// đảm nhiệm sau khi viết). extraFeedback dùng cho retry khi lệch số từ.
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

// Lưới cuối chống nhãn "Cần sửa số từ": khi cả cắt câu lẫn retry đều không đưa
// tổng về 100-120 từ, gọi 1 cú NÉN siêu rẻ (input chỉ ~150 từ, không cần cache)
// yêu cầu rút content về đích từ tính sẵn. Trả plain text hoặc null nếu lỗi.
async function compressWithClaude(
  title: string,
  content: string,
  apiKey: string,
  supabase: SupabaseClient,
): Promise<string | null> {
  const tw = countWords(title);
  const lo = TOTAL_MIN - tw + 2, hi = TOTAL_MAX - tw - 2; // đệm 2 từ mỗi đầu
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 500,
      temperature: 0.2,
      system:
        "Bạn là biên tập viên. Rút ngắn bản tin được đưa xuống đúng khoảng số từ yêu cầu: giữ dữ kiện cốt lõi (chủ thể, diễn biến, thời gian, số liệu chính), bỏ chi tiết phụ (trích dẫn phụ, số liệu thứ cấp, bối cảnh xa). Giữ nguyên văn phong tin tức, viết liền 1 đoạn, không sai chính tả. Trả về DUY NHẤT nội dung đã rút gọn — không giải thích, không markdown, không tiêu đề.",
      messages: [{
        role: "user",
        content: `Rút bản tin sau xuống còn ${lo}-${hi} từ (đếm từ = tách theo khoảng trắng):\n\n${content}`,
      }],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (data?.usage) {
    await logLlmUsage(supabase, { functionName: "crawl-news", model: ANTHROPIC_MODEL, usage: data.usage });
  }
  const out = (data?.content?.[0]?.text ?? "").trim();
  return out || null;
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

  // ===== MODE: discover_feeds — dò RSS của danh sách domain bất kỳ =====
  // (khảo sát nguồn mới từ egress Supabase; không đụng DB, không LLM)
  // Cách dò mỗi domain: tải trang chủ → gom ứng viên từ <link rel=alternate
  // type=rss+xml>, các href chứa "rss/feed", + các path phổ biến → fetch thử
  // từng ứng viên, đếm <item>/<entry>. Trả tối đa 3 feed sống/domain.
  if (body?.mode === "discover_feeds") {
    const urls: string[] = Array.isArray(body.urls) ? (body.urls as unknown[]).map(String) : [];
    if (urls.length === 0) return json({ error: "Thiếu urls[]" }, 400);
    const started = Date.now();
    const results: unknown[] = [];
    const CONC = 8;
    for (let i = 0; i < urls.length; i += CONC) {
      if (Date.now() - started > 130000) {
        results.push(...urls.slice(i).map((u) => ({ domain: u, error: "hết thời gian — gọi lại với phần còn thiếu" })));
        break;
      }
      const batch = urls.slice(i, i + CONC);
      await Promise.all(batch.map(async (raw) => {
        try {
          const home = new URL(raw.trim());
          const res = await fetchWithTimeout(home.toString(), 12000);
          const html = await res.text();
          const cands = new Set<string>();
          for (const m of html.match(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/gi) ?? []) {
            const href = m.match(/href=["']([^"']+)["']/i)?.[1];
            if (href) { try { cands.add(new URL(href, home).toString()); } catch { /* href hỏng */ } }
          }
          const aRe = /href=["']([^"']*(?:\.rss|\/rss\b|\/feed\b)[^"']*)["']/gi;
          let am: RegExpExecArray | null; let n = 0;
          while ((am = aRe.exec(html)) !== null && n < 8) {
            try { cands.add(new URL(am[1], home).toString()); n++; } catch { /* bỏ */ }
          }
          for (const p of ["/rss", "/rss.xml", "/feed", "/rss/home.rss", "/rss/tin-moi-nhat.rss", "/rss/trang-chu.rss"]) {
            cands.add(new URL(p, home.origin).toString());
          }
          const feeds: { url: string; items: number }[] = [];
          for (const c of Array.from(cands).slice(0, 10)) {
            try {
              const r = await fetchWithTimeout(c, 8000);
              if (!r.ok) continue;
              const t = await r.text();
              const items = (t.match(/<item[\s>]/gi) ?? []).length + (t.match(/<entry[\s>]/gi) ?? []).length;
              if (items > 0) feeds.push({ url: c, items });
              if (feeds.length >= 3) break;
            } catch { /* ứng viên chết, thử cái sau */ }
          }
          results.push({ domain: home.hostname, http: res.status, feeds });
        } catch (e) {
          results.push({ domain: raw, error: (e as Error).message.slice(0, 100) });
        }
      }));
    }
    const withFeeds = (results as { feeds?: unknown[] }[]).filter((r) => (r.feeds?.length ?? 0) > 0).length;
    return json({ ok: true, mode: "discover_feeds", total: urls.length, with_feeds: withFeeds, results });
  }

  // ===== MODE: reformat_pending — áp chuẩn hiển thị mới cho tin ĐANG CHỜ =====
  // (one-shot theo yêu cầu sếp 15/07: tiêu đề HOA + 2 khổ; không tốn LLM)
  if (body?.mode === "reformat_pending") {
    const { data: rows, error } = await supabase
      .from("news")
      .select("id, title, description, ai_classification")
      .eq("review_status", "pending")
      .is("submitted_by", null)
      .limit(2000);
    if (error) return json({ error: error.message }, 500);
    const list = (rows ?? []) as { id: string; title: string; description: string | null; ai_classification: Record<string, unknown> | null }[];
    let updated = 0;
    const errs: string[] = [];
    for (let i = 0; i < list.length; i += 25) {
      const batch = list.slice(i, i + 25);
      await Promise.all(batch.map(async (row) => {
        const newTitle = formatTitle(row.title ?? "");
        // Áp chuẩn mới 100-120 + 1 khổ: cắt câu cuối cho lọt trần 120, gộp 1 khổ.
        const trimmed = trimToFit(newTitle, (row.description ?? "").trim());
        const newDesc = flattenToOneParagraph(trimmed);
        const tw = countWords(newTitle);
        const total = tw + countWords(newDesc);
        const needsEdit = tw < TITLE_MIN || tw > TITLE_MAX || total < TOTAL_MIN || total > TOTAL_MAX;
        const ai = { ...(row.ai_classification ?? {}), needs_edit: needsEdit, title_words: tw, total_words: total };
        if (newTitle === row.title && newDesc === (row.description ?? "") &&
            (row.ai_classification as { needs_edit?: boolean } | null)?.needs_edit === needsEdit) return;
        const { error: uErr } = await supabase.from("news")
          .update({ title: newTitle, description: newDesc, ai_classification: ai })
          .eq("id", row.id);
        if (uErr) errs.push(uErr.message.slice(0, 80));
        else updated++;
      }));
    }
    return json({ ok: true, mode: "reformat_pending", total: list.length, updated, errors: errs.slice(0, 5) });
  }

  // ===== MODE: add_sources — dò feed của từng trang rồi TỰ SEED crawl_sources =====
  // body: {mode:"add_sources", sources:[{name, base_url, default_category, tier}]}
  // Mỗi trang: dò RSS như discover_feeds → lấy tối đa 3 feed sống → INSERT
  // (ON CONFLICT list_url bỏ qua). Chỉ feed chạy thật mới vào bảng.
  if (body?.mode === "add_sources") {
    const wanted = Array.isArray(body.sources) ? (body.sources as Record<string, unknown>[]) : [];
    if (wanted.length === 0) return json({ error: "Thiếu sources[]" }, 400);
    const started = Date.now();
    const report: unknown[] = [];
    for (let i = 0; i < wanted.length; i += 6) {
      if (Date.now() - started > 130000) {
        report.push(...wanted.slice(i).map((w) => ({ name: w.name, error: "hết thời gian — gọi lại với phần còn thiếu" })));
        break;
      }
      const batch = wanted.slice(i, i + 6);
      await Promise.all(batch.map(async (w) => {
        const name = String(w.name ?? "");
        const baseUrl = String(w.base_url ?? "");
        const cat = String(w.default_category ?? "xa-hoi-van-hoa");
        const tier = Number(w.tier) >= 1 && Number(w.tier) <= 3 ? Number(w.tier) : 2;
        try {
          const home = new URL(baseUrl);
          const res = await fetchWithTimeout(home.toString(), 15000);
          const html = await res.text();
          const cands = new Set<string>();
          for (const m of html.match(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/gi) ?? []) {
            const href = m.match(/href=["']([^"']+)["']/i)?.[1];
            if (href) { try { cands.add(new URL(href, home).toString()); } catch { /* bỏ */ } }
          }
          const aRe = /href=["']([^"']*(?:\.rss|\/rss\b|\/feed\b)[^"']*)["']/gi;
          let am: RegExpExecArray | null; let n = 0;
          while ((am = aRe.exec(html)) !== null && n < 12) {
            try { cands.add(new URL(am[1], home).toString()); n++; } catch { /* bỏ */ }
          }
          // v2: nhiều báo VN (Báo Tin Tức, Dân Việt, Znews...) không khai feed
          // trên trang chủ mà gom vào TRANG MỤC LỤC RSS riêng — quét thêm.
          for (const idx of ["/rss", "/rss.html", "/rss.htm"]) {
            try {
              const ir = await fetchWithTimeout(new URL(idx, home.origin).toString(), 10000);
              if (!ir.ok) continue;
              const ih = await ir.text();
              const iRe = /href=["']([^"']*\.rss[^"']*)["']/gi;
              let im: RegExpExecArray | null; let k = 0;
              while ((im = iRe.exec(ih)) !== null && k < 20) {
                try { cands.add(new URL(im[1], home).toString()); k++; } catch { /* bỏ */ }
              }
              if (k > 0) break; // trang mục lục đầu tiên có feed là đủ
            } catch { /* không có trang mục lục này */ }
          }
          for (const p of [
            "/rss", "/rss.xml", "/feed",
            "/rss/home.rss", "/rss/tin-moi-nhat.rss", "/rss/trang-chu.rss",
            "/rss/thoi-su.rss", "/rss/tin-moi.rss", "/rss/tin-tuc.rss",
            "/thoi-su.rss", "/tin-moi-nhat.rss", "/trang-chu.rss", "/home.rss",
          ]) {
            cands.add(new URL(p, home.origin).toString());
          }
          const feeds: { url: string; items: number }[] = [];
          for (const c of Array.from(cands).filter((u) => !URL_NOISE_RE.test(u)).slice(0, 18)) {
            try {
              const r = await fetchWithTimeout(c, 8000);
              if (!r.ok) continue;
              const t = await r.text();
              const items = (t.match(/<item[\s>]/gi) ?? []).length + (t.match(/<entry[\s>]/gi) ?? []).length;
              if (items >= 5) feeds.push({ url: c, items });
              if (feeds.length >= 3) break;
            } catch { /* ứng viên chết */ }
          }
          if (feeds.length === 0) {
            report.push({ name, base_url: baseUrl, added: 0, note: "không tìm thấy RSS sống — cần URL feed thủ công" });
            return;
          }
          let added = 0;
          const addedUrls: string[] = [];
          for (let k = 0; k < feeds.length; k++) {
            const label = feeds.length > 1
              ? `${name} — ${new URL(feeds[k].url).pathname.replace(/^\/|\.rss$|\.xml$/gi, "").replace(/\//g, " ").trim() || `feed ${k + 1}`}`
              : name;
            const { error: insErr } = await supabase.from("crawl_sources").insert({
              name: label.slice(0, 120),
              base_url: home.origin,
              list_url: feeds[k].url,
              feed_type: "rss",
              default_category: cat,
              tier,
              is_active: true,
            });
            if (!insErr) { added++; addedUrls.push(feeds[k].url); }
            else if (!String(insErr.message).includes("duplicate")) {
              report.push({ name, insert_error: insErr.message.slice(0, 120) });
            }
          }
          report.push({ name, base_url: baseUrl, added, feeds: addedUrls });
        } catch (e) {
          report.push({ name, base_url: baseUrl, error: (e as Error).message.slice(0, 100) });
        }
      }));
    }
    const totalAdded = (report as { added?: number }[]).reduce((a, r) => a + (r.added ?? 0), 0);
    return json({ ok: true, mode: "add_sources", total_added: totalAdded, report });
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
    compressCalls: 0, verifyCalls: 0, preDupCalls: 0, preDupBlocked: 0,
    p1Rejected: 0, p1Dup: 0, p1NewDev: 0, p1NeedsCheck: 0,
    errors: [] as string[],
  };
  let llmCalls = 0;
  const startTime = Date.now();

  const processSource = async (src: Source) => {
    stats.sources++;
    try {
      const listRes = await fetchWithTimeout(src.list_url);
      if (!listRes.ok) throw new Error(`list HTTP ${listRes.status}`);
      const listBody = (await listRes.text()).slice(0, MAX_HTML_CHARS);

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

          // So trùng với tin ĐÃ ĐĂNG theo tiêu đề GỐC (luật P1: điểm tương đồng
          // chỉ để chọn tin cần đối chiếu — KHÔNG tự động loại dù cao; giám khảo
          // P1 sau khi viết mới là người phán).
          let suspect: SimilarHit | null = null;
          if (c.title) {
            suspect = await findSimilarPublished(supabase, c.title);
          }

          const artRes = await fetchWithTimeout(canonical);
          if (!artRes.ok) { stats.errors.push(`${src.name}: article HTTP ${artRes.status}`); continue; }
          const artHtml = (await artRes.text()).slice(0, MAX_HTML_CHARS);
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

          // KIỂM TRÙNG SỚM: nghi trùng nặng (>= SIM_BLOCK) → hỏi AI "cùng sự
          // kiện?" trên BÀI GỐC trước, trùng thì khỏi tốn cú viết đắt tiền.
          // AI lỗi/không chắc → cứ viết như thường (fail-open, không loại oan).
          if (suspect && suspect.title && suspect.sim >= SIM_BLOCK && llmCalls < maxLlmCalls) {
            llmCalls++; stats.llmCalls++; stats.preDupCalls++;
            const pre = await preVerifyDup(origTitle, content, suspect, anthropicKey, supabase);
            if (pre && pre.verdict === "trung") {
              stats.preDupBlocked++;
              await logReject(supabase, {
                stage: "kiem_som", verdict: "trung", source_name: src.name, url: canonical,
                original_title: origTitle, reason: pre.reason,
                similar_news_id: suspect.id, similar_title: suspect.title,
                similar_sim: Math.round(suspect.sim * 100) / 100,
              });
              continue;
            }
          }

          // P3 VIẾT: LLM viết lại + phân loại (retry 1 lần nếu lệch số từ).
          llmCalls++; stats.llmCalls++;
          let r = await rewriteWithClaude(origTitle, content, publishedAt.slice(0, 10), anthropicKey, supabase);
          if (!r) { stats.errors.push(`${src.name}: LLM trả về không parse được`); continue; }
          if (!r.is_news) {
            stats.rejectedNonNews++;
            await logReject(supabase, {
              stage: "viet", verdict: "loai", source_name: src.name, url: canonical,
              original_title: origTitle, reason: r.reject_reason || "không phải tin",
            });
            continue;
          }

          // Vượt trần → cắt câu cuối (rẻ, không tốn LLM). Vẫn lệch → retry 1 lần
          // với feedback, cắt tiếp; cuối cùng mới đánh needs_edit.
          r.content = trimToFit(r.title, r.content);
          let tw = countWords(r.title), total = tw + countWords(r.content);
          let needsEdit = false;
          if (tw < TITLE_MIN || tw > TITLE_MAX || total < TOTAL_MIN || total > TOTAL_MAX) {
            if (llmCalls < maxLlmCalls) {
              llmCalls++; stats.llmCalls++;
              const fb = `\n\nLƯU Ý RETRY: bản trước có tiêu đề ${tw} từ, tổng ${total} từ — KHÔNG đạt chuẩn (tiêu đề ${TITLE_MIN}-${TITLE_MAX}, tổng ${TOTAL_MIN}-${TOTAL_MAX}). Viết lại NGẮN HƠN HẲN và đếm kỹ số từ.`;
              const r2 = await rewriteWithClaude(origTitle, content, publishedAt.slice(0, 10), anthropicKey, supabase, fb);
              if (r2 && r2.is_news && r2.title && r2.content) {
                r2.content = trimToFit(r2.title, r2.content);
                r = r2;
              }
            }
            tw = countWords(r.title); total = tw + countWords(r.content);
            // Lưới cuối: title đạt nhưng tổng vẫn VƯỢT trần (cắt câu không lọt
            // cửa sổ hẹp 20 từ) → 1 cú nén siêu rẻ thay vì dán nhãn needs_edit.
            if (total > TOTAL_MAX && tw >= TITLE_MIN && tw <= TITLE_MAX && llmCalls < maxLlmCalls) {
              llmCalls++; stats.llmCalls++; stats.compressCalls++;
              const squeezed = await compressWithClaude(r.title, r.content, anthropicKey, supabase);
              if (squeezed) {
                const cand = trimToFit(r.title, flattenToOneParagraph(squeezed));
                const candTotal = tw + countWords(cand);
                if (candTotal >= TOTAL_MIN && candTotal <= TOTAL_MAX) r.content = cand;
              }
              total = tw + countWords(r.content);
            }
            if (tw < TITLE_MIN || tw > TITLE_MAX || total < TOTAL_MIN || total > TOTAL_MAX) {
              needsEdit = true; // vẫn đưa vào hàng đợi, nhân viên sửa lúc duyệt
            }
          }
          if (!r.title || !r.content) { stats.errors.push(`${src.name}: LLM thiếu title/content`); continue; }

          // Chuẩn hiển thị: tiêu đề HOA toàn bộ + nội dung 2 khổ (sau mọi bước
          // trim/retry).
          r.title = formatTitle(r.title);
          r.content = flattenToOneParagraph(r.content);

          // So trùng lần 2 với tiêu đề MỚI (bản viết lại có thể giống tin đã
          // đăng theo cách khác) — lấy nghi phạm giống nhất trong 2 lần so.
          const hit3 = await findSimilarPublished(supabase, r.title);
          if (hit3 && (!suspect || hit3.sim > suspect.sim)) suspect = hit3;

          // ===== GIÁM KHẢO P1 (lượt kiểm 1): đối chiếu bản tin với bài gốc +
          // phán trùng. Không phản hồi/hết trần LLM → cho vào hàng đợi kèm nhãn
          // "cần kiểm tra" (fail-open — người duyệt vẫn là chốt chặn cuối).
          let verify: VerifyResult | null = null;
          if (llmCalls < maxLlmCalls) {
            llmCalls++; stats.llmCalls++; stats.verifyCalls++;
            verify = await verifyWithClaude(origTitle, content, r.title, r.content, suspect, anthropicKey, supabase);
          }
          if (verify && (verify.verdict === "loai" || verify.verdict === "trung")) {
            if (verify.verdict === "trung") stats.p1Dup++; else stats.p1Rejected++;
            await logReject(supabase, {
              stage: "kiem", verdict: verify.verdict, source_name: src.name, url: canonical,
              original_title: origTitle, rewritten_title: r.title, reason: verify.reason,
              ...(suspect && suspect.title
                ? { similar_news_id: suspect.id, similar_title: suspect.title, similar_sim: Math.round(suspect.sim * 100) / 100 }
                : {}),
            });
            continue;
          }
          const newDev = verify?.verdict === "dien_bien_moi";
          const needsCheck = !verify || verify.verdict === "can_kiem_tra";
          if (newDev) stats.p1NewDev++;
          if (needsCheck) stats.p1NeedsCheck++;

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
              // Badge "⚠️ Giống X%" trên trang duyệt — lưới phụ cho người duyệt
              // khi giám khảo P1 đã cho qua tin nghi trùng.
              ...(suspect && suspect.title
                ? { similar_title: suspect.title, similar_sim: Math.round(suspect.sim * 100) / 100 }
                : {}),
              // Nhãn theo phán quyết P1: 🆕 diễn biến mới / 🔍 cần kiểm tra.
              ...(newDev ? { new_development: { note: verify?.new_info ?? "", similar_title: suspect?.title ?? "" } } : {}),
              ...(needsCheck ? { needs_check: verify?.reason || "Giám khảo P1 không phản hồi — cần người kiểm kỹ" } : {}),
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
