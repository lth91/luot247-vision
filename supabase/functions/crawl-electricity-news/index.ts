// Crawl 27 nguồn tin ngành điện VN, tóm tắt ≤150 từ bằng Claude Haiku 4.5, lưu vào electricity_news.
// Giới hạn 3 nguồn/lần (rotate theo last_crawled_at ASC) để tránh timeout 60s của edge function.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { DOMParser, Element } from "https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const MAX_SOURCES_PER_RUN = 3;
const MAX_ARTICLES_PER_SOURCE = 5;
const FETCH_TIMEOUT_MS = 15000;
const MAX_CONTENT_CHARS = 8000;

interface Source {
  id: string;
  name: string;
  base_url: string;
  list_url: string;
  feed_type: "rss" | "html_list";
  list_link_pattern: string | null;
  article_content_selector: string | null;
  category: string;
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
    // Giữ query vì một số site dùng id=123 trong query; chỉ bỏ utm_*
    const keep = new URLSearchParams();
    u.searchParams.forEach((v, k) => {
      if (!k.startsWith("utm_") && k !== "fbclid") keep.set(k, v);
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
    // Không lấy link khác domain
    try {
      if (new URL(abs).host !== new URL(source.base_url).host) return;
    } catch {
      return;
    }
    urls.add(abs);
  });
  return Array.from(urls).slice(0, MAX_ARTICLES_PER_SOURCE);
}

function extractRssItems(xml: string): { url: string; title: string; pubDate: string | null }[] {
  const items: { url: string; title: string; pubDate: string | null }[] = [];
  const itemRegex = /<item[\s\S]*?<\/item>/gi;
  const matches = xml.match(itemRegex) || [];
  for (const it of matches) {
    const link = it.match(/<link>([\s\S]*?)<\/link>/i)?.[1]?.trim();
    const title = it.match(/<title(?:\s[^>]*)?>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1]?.trim();
    const pub = it.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1]?.trim() ?? null;
    if (link && title) items.push({ url: link, title, pubDate: pub });
    if (items.length >= MAX_ARTICLES_PER_SOURCE) break;
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
    contentEl.querySelectorAll("script, style, iframe, .advertisement, .related-news").forEach((n) => (n as Element).remove());
    content = contentEl.textContent || "";
  } else {
    // fallback: concat tất cả <p>
    const ps: string[] = [];
    doc.querySelectorAll("p").forEach((p) => {
      const t = (p.textContent || "").trim();
      if (t.length > 40) ps.push(t);
    });
    content = ps.join("\n");
  }
  content = stripHtml(content).slice(0, MAX_CONTENT_CHARS);
  return { title: stripHtml(title), content };
}

async function summarizeWithClaude(
  title: string,
  content: string,
  apiKey: string,
): Promise<{ summary: string; publishedDate: string | null }> {
  const systemPrompt = `Bạn là biên tập viên tin tức chuyên ngành điện Việt Nam. Nhiệm vụ: đọc bài báo và trả về JSON gồm ngày xuất bản + tóm tắt.

ĐỊNH DẠNG ĐẦU RA BẮT BUỘC (JSON thuần, không markdown, không giải thích):
{"published_date": "YYYY-MM-DD hoặc null", "summary": "..."}

QUY TẮC:
- published_date: ngày xuất bản bài (nếu rõ ràng nêu trong bài hoặc tiêu đề). Dạng YYYY-MM-DD. Nếu không xác định được thì trả null. KHÔNG được đoán hoặc dùng ngày hiện tại.
- summary: tóm tắt bài báo dưới 150 từ bằng tiếng Việt
  + Văn phong tin tức chuyên ngành, khách quan, trang trọng
  + Phải nêu rõ: ngày (dd/mm/yyyy nếu có), chủ thể chính, sự kiện/hành động, kết quả/ý nghĩa
  + Không dùng câu mở đầu như "Bài báo nói về…"
  + Không lặp lại tiêu đề

VÍ DỤ MẪU:
{"published_date":"2026-04-17","summary":"Sáng 17/04/2026, Bộ Công Thương họp tổ soạn thảo dự án Luật Điện lực sửa đổi dưới sự chủ trì của Thứ trưởng Nguyễn Hoàng Long. Dự án được tách thành nhiệm vụ lập pháp riêng, đã lấy ý kiến từ đầu tháng 2/2026 và công khai hồ sơ trên các cổng thông tin."}

{"published_date":"2026-04-17","summary":"Ngày 17/04/2026, EVNGENCO2 đẩy nhanh dự án điện gió Hướng Phùng 1, đã giải phóng 65.755 m² mặt bằng và triển khai nhiều hạng mục như trạm 110kV, tua bin và đường dây. Dự án phấn đấu hoàn tất giải phóng mặt bằng vào tháng 6/2026 để đảm bảo tiến độ thi công."}`;

  const userMsg = `Tiêu đề: ${title}\n\nNội dung:\n${content}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 700,
      system: systemPrompt,
      messages: [{ role: "user", content: userMsg }],
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Anthropic ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  const raw: string = (data?.content?.[0]?.text ?? "").trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { summary: raw, publishedDate: null };
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const summary = String(parsed.summary ?? "").trim();
    const pd = parsed.published_date;
    const publishedDate = typeof pd === "string" && /^\d{4}-\d{2}-\d{2}$/.test(pd) ? pd : null;
    return { summary, publishedDate };
  } catch {
    return { summary: raw, publishedDate: null };
  }
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function parseRssDate(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// Parse ngày xuất bản từ HTML meta tags theo chuẩn Open Graph / Schema.org / JSON-LD.
// VnExpress, CafeF, EVN, Bộ Công Thương… đều có ít nhất 1 trong các tag sau.
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
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

  if (!anthropicKey) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY chưa được set trong Edge Function Secrets" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Hỗ trợ body { source_id } để crawl 1 nguồn cụ thể (dùng cho nút "Retry" ở UI)
  let forcedSourceId: string | null = null;
  try {
    const body = await req.json();
    forcedSourceId = body?.source_id ?? null;
  } catch {
    // không có body, cron call sẽ trống
  }

  // Pick sources
  let query = supabase.from("electricity_sources").select("*").eq("is_active", true).order("last_crawled_at", { ascending: true, nullsFirst: true });
  if (forcedSourceId) {
    query = supabase.from("electricity_sources").select("*").eq("id", forcedSourceId);
  } else {
    query = query.limit(MAX_SOURCES_PER_RUN);
  }
  const { data: sources, error: sErr } = await query;
  if (sErr) {
    return new Response(JSON.stringify({ error: sErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const stats = { sources: 0, articlesFound: 0, articlesInserted: 0, errors: [] as string[] };

  for (const src of (sources as Source[]) ?? []) {
    stats.sources++;
    try {
      const listRes = await fetchWithTimeout(src.list_url);
      if (!listRes.ok) throw new Error(`list HTTP ${listRes.status}`);
      const listBody = await listRes.text();

      let candidates: { url: string; title?: string; pubDate?: string | null }[] = [];
      if (src.feed_type === "rss") {
        candidates = extractRssItems(listBody).map((i) => ({ url: i.url, title: i.title, pubDate: i.pubDate }));
      } else {
        candidates = extractLinks(listBody, src).map((u) => ({ url: u }));
      }
      stats.articlesFound += candidates.length;

      for (const c of candidates) {
        const canonical = canonicalizeUrl(c.url, src.base_url);
        if (!canonical) continue;
        const hash = await sha256Hex(canonical);

        const { data: exists } = await supabase
          .from("electricity_news")
          .select("id")
          .eq("url_hash", hash)
          .maybeSingle();
        if (exists) continue;

        try {
          const artRes = await fetchWithTimeout(canonical);
          if (!artRes.ok) {
            stats.errors.push(`${src.name}: article HTTP ${artRes.status}`);
            continue;
          }
          const artHtml = await artRes.text();
          const { title, content } = extractArticleContent(artHtml, src.article_content_selector);
          if (!content || content.length < 200) {
            stats.errors.push(`${src.name}: nội dung quá ngắn (${content.length})`);
            continue;
          }
          const finalTitle = (c.title || title || "").trim() || "(Không có tiêu đề)";

          // Xác định ngày xuất bản trước khi tốn token Claude.
          // Ưu tiên: meta tag HTML > RSS pubDate. Nếu cả hai đều không có, sẽ
          // hỏi Claude ở bước tóm tắt và dùng kết quả đó. Nếu vẫn null → skip.
          const metaDate = extractPublishedDateFromHtml(artHtml);
          const rssDate = parseRssDate(c.pubDate ?? null);
          let preSummaryDate = metaDate ?? rssDate;
          const threeDaysMs = 3 * 24 * 60 * 60 * 1000;

          // Nếu đã xác định được ngày ở đây và quá cũ, bỏ qua LUÔN, tiết kiệm token Claude.
          if (preSummaryDate) {
            const ageMs = Date.now() - new Date(preSummaryDate).getTime();
            if (ageMs > threeDaysMs) {
              stats.errors.push(`${src.name}: bài cũ (${preSummaryDate.slice(0, 10)}), bỏ qua`);
              continue;
            }
          }

          const { summary, publishedDate } = await summarizeWithClaude(finalTitle, content, anthropicKey);
          if (!summary) {
            stats.errors.push(`${src.name}: Claude trả về rỗng`);
            continue;
          }
          const wc = wordCount(summary);
          const llmDateIso = publishedDate ? `${publishedDate}T00:00:00Z` : null;
          const publishedAt = preSummaryDate ?? llmDateIso;

          // STRICT: bắt buộc phải xác định được ngày. Nếu không, skip.
          if (!publishedAt) {
            stats.errors.push(`${src.name}: không xác định được ngày xuất bản, bỏ qua`);
            continue;
          }
          const ageMs = Date.now() - new Date(publishedAt).getTime();
          if (ageMs > threeDaysMs) {
            stats.errors.push(`${src.name}: bài cũ (${publishedAt.slice(0, 10)}), bỏ qua`);
            continue;
          }

          const { error: insErr } = await supabase.from("electricity_news").insert({
            source_id: src.id,
            source_name: src.name,
            source_category: src.category,
            title: finalTitle,
            summary,
            original_url: canonical,
            url_hash: hash,
            published_at: publishedAt,
            summary_word_count: wc,
          });
          if (insErr) {
            // bỏ qua lỗi unique (race condition)
            if (!String(insErr.message).includes("duplicate")) {
              stats.errors.push(`${src.name}: insert ${insErr.message}`);
            }
          } else {
            stats.articlesInserted++;
          }
        } catch (e) {
          stats.errors.push(`${src.name}: ${(e as Error).message}`);
        }
      }

      await supabase
        .from("electricity_sources")
        .update({
          last_crawled_at: new Date().toISOString(),
          consecutive_failures: 0,
          last_error: null,
        })
        .eq("id", src.id);
    } catch (e) {
      const msg = (e as Error).message;
      stats.errors.push(`${src.name}: ${msg}`);
      const newFails = src.consecutive_failures + 1;
      await supabase
        .from("electricity_sources")
        .update({
          last_crawled_at: new Date().toISOString(),
          consecutive_failures: newFails,
          last_error: msg.slice(0, 500),
          is_active: newFails < 5,
        })
        .eq("id", src.id);
    }
  }

  return new Response(JSON.stringify({ ok: true, ...stats }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
