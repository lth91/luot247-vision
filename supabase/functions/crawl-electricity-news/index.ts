// Crawl 27 nguồn tin ngành điện VN, tóm tắt ≤150 từ bằng Claude Haiku 4.5, lưu vào electricity_news.
// Quét TẤT CẢ nguồn mỗi lần chạy; song song SOURCE_CONCURRENCY nguồn cùng lúc để tôn trọng rate limit.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { DOMParser, Element } from "https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts";
import { isElectricityTopical } from "../_shared/electricity-keywords.ts";

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
const MAX_CONTENT_CHARS = 8000;

// Per-tier candidate cap. Tier 1/2 dùng dedicated electricity channels →
// 8 bài đầu đủ. Tier 3 broad channels (báo-chí Kinh tế/Tài chính) bài
// điện thường nằm vị trí 7-20 giữa nhiều bài stock/banking → cần quét
// rộng hơn. Trade-off: ~2-3x LLM call cho tier 3 nhưng catch nhiều hơn.
function maxArticlesFor(tier: number | null): number {
  if (tier === 1) return 8;
  if (tier === 2) return 12;
  return 20; // tier 3 hoặc null
}

interface Source {
  id: string;
  name: string;
  base_url: string;
  list_url: string;
  feed_type: "rss" | "html_list";
  list_link_pattern: string | null;
  article_content_selector: string | null;
  category: string;
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
  return Array.from(urls).slice(0, maxArticlesFor(source.tier));
}

function extractRssItems(xml: string, max: number): { url: string; title: string; pubDate: string | null }[] {
  const items: { url: string; title: string; pubDate: string | null }[] = [];
  const itemRegex = /<item[\s\S]*?<\/item>/gi;
  const matches = xml.match(itemRegex) || [];
  for (const it of matches) {
    const link = it.match(/<link>([\s\S]*?)<\/link>/i)?.[1]?.trim();
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
    contentEl.querySelectorAll("script, style, iframe, nav, footer, aside, .advertisement, .related-news, .box-related, .related-articles, .sidebar").forEach((n) => (n as Element).remove());
    content = contentEl.textContent || "";
  } else {
    // Fallback 1: meta description (ngắn nhưng chuẩn, tránh sidebar)
    const ogDesc = doc.querySelector("meta[property='og:description']")?.getAttribute("content") || "";
    const metaDesc = doc.querySelector("meta[name='description']")?.getAttribute("content") || "";
    const desc = (ogDesc.length > metaDesc.length ? ogDesc : metaDesc).trim();
    if (desc.length > 150) content = desc;
    // Fallback 2: concat <p> chỉ trong <main>/<article>, tránh sidebar global
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

// Detect summary dạng "xin lỗi, không khớp tiêu đề" → skip insert
function isInvalidSummary(summary: string): boolean {
  const badPatterns = [
    /^nội dung bài (không|chưa)/i,
    /không (cung cấp|phù hợp|liên quan) (thông tin|với tiêu đề)/i,
    /^bài (báo|viết) (không|chưa) (cung cấp|đề cập|nói)/i,
    /^xin lỗi/i,
    /^tôi (không thể|cần thêm)/i,
  ];
  return badPatterns.some((p) => p.test(summary));
}

async function summarizeWithClaude(
  title: string,
  content: string,
  apiKey: string,
  knownPublishedDate: string | null = null,
): Promise<{ summary: string; publishedDate: string | null; relevant: boolean }> {
  const systemPrompt = `Bạn là biên tập viên tin tức chuyên ngành điện Việt Nam. Nhiệm vụ: đọc bài báo, đánh giá có thuộc ngành điện/năng lượng điện không, rồi trả về JSON.

ĐỊNH DẠNG ĐẦU RA BẮT BUỘC (JSON thuần, không markdown, không giải thích):
{"relevant": true/false, "published_date": "YYYY-MM-DD hoặc null", "summary": "..."}

QUY TẮC:
- relevant: true CHỈ KHI bài có CHỦ ĐỀ CHÍNH là ngành điện (EVN, lưới điện, nhà máy điện, điện gió/mặt trời/hạt nhân/khí, giá điện, cung ứng điện, tiết kiệm điện, chính sách điện lực, BESS, PPA, Quy hoạch điện…). Nếu chỉ nhắc lướt "điện" hoặc bài về tai nạn/lifestyle/showbiz/giải trí/thể thao/bất động sản/cung hoàng đạo/giao thông/y tế… → relevant: false.
- Nếu relevant: false → vẫn TRẢ summary ngắn 1 câu giải thích "Bài không thuộc ngành điện: <lý do ngắn>" để debug. published_date có thể null.
- published_date: ngày xuất bản bài (nếu rõ ràng nêu trong bài hoặc tiêu đề). Dạng YYYY-MM-DD. Nếu không xác định được thì trả null. KHÔNG được đoán hoặc dùng ngày hiện tại.
- summary (khi relevant: true): tóm tắt bài báo dưới 150 từ bằng tiếng Việt, văn phong tin tức chuyên ngành, khách quan, trang trọng.

QUAN TRỌNG — MỞ ĐẦU SUMMARY BẰNG MỐC THỜI GIAN TỰ NHIÊN:
  + Nếu bài nêu rõ buổi/ngày cụ thể: dùng "Sáng 22/4", "Chiều 22/4", "Tối 22/4", "Trưa 22/4", "Đêm 22/4". KHÔNG kèm năm trừ khi là sự kiện quá khứ xa hoặc kế hoạch tương lai.
  + Nếu chỉ có ngày (không có buổi): dùng "Ngày 22/4" hoặc "22/4".
  + Nếu là xu hướng/thống kê cả kỳ: dùng "Năm 2025", "Quý I/2026", "Tuần qua", "Đầu tháng 4/2026".
  + Nếu là dự kiến: dùng "Dự kiến tháng 6/2026", "Đến 2030".
  + TUYỆT ĐỐI không dùng định dạng khô cứng "Ngày 22/04/2026" hay "Vào ngày 22/4/2026".
  + Không lặp lại tiêu đề, không mở đầu "Bài báo nói về…", "Theo bài viết…".

VÍ DỤ MẪU:
{"published_date":"2026-04-17","summary":"Sáng 17/4, Bộ Công Thương họp tổ soạn thảo dự án Luật Điện lực sửa đổi dưới sự chủ trì của Thứ trưởng Nguyễn Hoàng Long. Dự án được tách thành nhiệm vụ lập pháp riêng, đã lấy ý kiến từ đầu tháng 2/2026 và công khai hồ sơ trên các cổng thông tin."}

{"published_date":"2026-04-17","summary":"Ngày 17/4, EVNGENCO2 đẩy nhanh dự án điện gió Hướng Phùng 1, đã giải phóng 65.755 m² mặt bằng và triển khai nhiều hạng mục như trạm 110kV, tua bin và đường dây. Dự kiến hoàn tất giải phóng mặt bằng vào tháng 6/2026 để đảm bảo tiến độ thi công."}

{"published_date":"2026-04-20","summary":"Năm 2025, năng lượng tái tạo lần đầu chiếm 34% sản lượng điện toàn cầu, vượt than đá (33%), đánh dấu bước ngoặt trong chuyển dịch năng lượng. Toàn bộ tăng trưởng nhu cầu điện được đáp ứng bởi năng lượng sạch, trong đó điện mặt trời tăng 30%, đóng vai trò chủ đạo."}`;

  const todayIso = new Date().toISOString().slice(0, 10);
  const dateHint = knownPublishedDate
    ? `\n\nNgày xuất bản đã xác định từ metadata: ${knownPublishedDate}. Dùng đúng ngày/tháng/NĂM này khi nhắc mốc thời gian trong summary, KHÔNG đoán năm khác.`
    : `\n\nKhông có ngày từ metadata. Nếu bài chỉ ghi "ngày 20/4" không kèm năm, mặc định là năm ${todayIso.slice(0, 4)} (hôm nay là ${todayIso}).`;
  const userMsg = `Tiêu đề: ${title}\n\nNội dung:\n${content}${dateHint}`;

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

  // Strip markdown code fences (```json ... ```) Claude đôi khi wrap response.
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const summary = String(parsed.summary ?? "").trim();
      const pd = parsed.published_date;
      const publishedDate = typeof pd === "string" && /^\d{4}-\d{2}-\d{2}$/.test(pd) ? pd : null;
      const relevant = parsed.relevant === false ? false : true;
      return { summary, publishedDate, relevant };
    } catch {
      // JSON.parse fail (Claude over-escape "\\\"" thay vì "\""): fall through.
    }
  }

  // Fallback: extract summary field bằng regex lenient để vẫn cứu được data
  // dù JSON malformed. Match "summary": "..." cho đến quote đóng (allow escape).
  const sumMatch = cleaned.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const dateMatch = cleaned.match(/"published_date"\s*:\s*"(\d{4}-\d{2}-\d{2})"/);
  const relMatch = cleaned.match(/"relevant"\s*:\s*(true|false)/);
  if (sumMatch) {
    const summary = sumMatch[1]
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\")
      .replace(/\\n/g, "\n")
      .trim();
    return {
      summary,
      publishedDate: dateMatch?.[1] ?? null,
      relevant: relMatch?.[1] === "false" ? false : true,
    };
  }

  // Cuối cùng: trả raw để tránh insert empty (vẫn invalid summary, sẽ skip
  // trong is_invalid_summary check phía caller hoặc dedup_electricity_news bỏ).
  return { summary: raw, publishedDate: null, relevant: true };
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
// Fallback inline: nguồn EVN family (evn.com.vn, cuc-dien-luc) đặt date dạng
// "DD/MM/YYYY - HH:MM" trong header, không có meta tag chuẩn.
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

  // Fallback: tìm cụm DD/MM/YYYY có HH:MM ngay cạnh — header của bài thường
  // xuất hiện trước list-related-articles, nên match đầu tiên là date của bài.
  // Yêu cầu phải có HH:MM kèm theo để loại trừ ngày xuất hiện trong nội dung body
  // (ví dụ "Chỉ thị số 10/CT-TTg ngày 30/3/2026").
  const dmyHm = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\s*[-–]\s*(\d{1,2}):(\d{2})\b/;
  const hmDmy = /\b(\d{1,2}):(\d{2}),?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\b/;
  let day: number | null = null;
  let month: number | null = null;
  let year: number | null = null;
  let hour: number | null = null;
  let minute: number | null = null;
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    return await handleCrawl(req);
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.error("uncaught:", msg, (e as Error)?.stack);
    return new Response(JSON.stringify({ error: msg, stack: (e as Error)?.stack }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function handleCrawl(req: Request): Promise<Response> {
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

  // Pick sources: chỉ SOURCES_PER_RUN nguồn mỗi lần (oldest first), tránh vượt resource limit
  // Các run cron 15min tiếp theo sẽ pick tiếp các nguồn còn lại.
  // Loại virtual sources (list_url không phải http URL) — chúng do edge function khác xử lý (vd RSS Discovery).
  let query = supabase.from("electricity_sources").select("*").eq("is_active", true).like("list_url", "http%").order("last_crawled_at", { ascending: true, nullsFirst: true }).limit(SOURCES_PER_RUN);
  if (forcedSourceId) {
    // Force-retry 1 source từ UI: bỏ filter is_active để cho phép thử lại nguồn đã auto-disable
    // (UI là cách duy nhất kích hoạt nhánh này; cron luôn không có body).
    query = supabase.from("electricity_sources").select("*").eq("id", forcedSourceId);
  }
  const { data: sources, error: sErr } = await query;
  if (sErr) {
    return new Response(JSON.stringify({ error: sErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const stats = { sources: 0, articlesFound: 0, articlesInserted: 0, errors: [] as string[] };

  const srcList = (sources as Source[]) ?? [];
  const processSource = async (src: Source) => {
    stats.sources++;
    try {
      const listRes = await fetchWithTimeout(src.list_url);
      if (!listRes.ok) throw new Error(`list HTTP ${listRes.status}`);
      const listBody = await listRes.text();

      let candidates: { url: string; title?: string; pubDate?: string | null }[] = [];
      if (src.feed_type === "rss") {
        candidates = extractRssItems(listBody, maxArticlesFor(src.tier)).map((i) => ({ url: i.url, title: i.title, pubDate: i.pubDate }));
      } else {
        candidates = extractLinks(listBody, src).map((u) => ({ url: u }));
      }
      stats.articlesFound += candidates.length;

      // Topical pre-filter cho tier-3 báo-chí RSS general feeds (vd nld.com.vn/rss/home.rss
      // trả tin tổng hợp). Chỉ giữ candidates có keyword điện/năng lượng trong title để
      // tránh tốn token Claude tóm tắt + insert tin off-topic. KHÔNG áp dụng cho:
      //   - tier 1/2 (DN/EVN/chuyên ngành — title không cần keyword)
      //   - HTML list (link extraction không có title)
      //   - sectional báo-chí (nếu category fix sectional, title vẫn match keyword tự nhiên)
      if (src.tier === 3 && src.category === "bao-chi" && src.feed_type === "rss") {
        const before = candidates.length;
        candidates = candidates.filter((c) => isElectricityTopical(c.title || ""));
        const skipped = before - candidates.length;
        if (skipped > 0) {
          stats.errors.push(`${src.name}: lọc ${skipped} bài off-topic (keyword filter tier-3)`);
        }
      }

      // HTTP 200 nhưng 0 link parse được = selector/RSS pattern hỏng. Treat as failure
      // để consecutive_failures tích lũy, nguồn die sẽ tự bị flag thay vì im lặng "thành công".
      if (candidates.length === 0) {
        const newFails = src.consecutive_failures + 1;
        await supabase
          .from("electricity_sources")
          .update({
            last_crawled_at: new Date().toISOString(),
            consecutive_failures: newFails,
            last_error: `no candidates parsed from ${src.feed_type} list`,
            is_active: newFails < 10,
          })
          .eq("id", src.id);
        stats.errors.push(`${src.name}: 0 candidates parsed (fails=${newFails})`);
        return;
      }

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
          const preSummaryDate = metaDate ?? rssDate;
          const threeDaysMs = 3 * 24 * 60 * 60 * 1000;

          // Nếu đã xác định được ngày ở đây và quá cũ, bỏ qua LUÔN, tiết kiệm token Claude.
          if (preSummaryDate) {
            const ageMs = Date.now() - new Date(preSummaryDate).getTime();
            if (ageMs > threeDaysMs) {
              stats.errors.push(`${src.name}: bài cũ (${preSummaryDate.slice(0, 10)}), bỏ qua`);
              continue;
            }
          }

          const preSummaryDateIso = preSummaryDate ? preSummaryDate.slice(0, 10) : null;
          const { summary, publishedDate, relevant } = await summarizeWithClaude(finalTitle, content, anthropicKey, preSummaryDateIso);
          if (!summary) {
            stats.errors.push(`${src.name}: Claude trả về rỗng`);
            continue;
          }
          if (!relevant) {
            // LLM safety net: bài lọt qua keyword filter nhưng Claude phán off-topic
            stats.errors.push(`${src.name}: LLM relevant=false, skip — ${summary.slice(0, 80)}`);
            continue;
          }
          if (isInvalidSummary(summary)) {
            stats.errors.push(`${src.name}: title-content mismatch, skip`);
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
      // Threshold 10 (cũ là 5): tránh disable nhầm các nguồn flaky tạm down. Cron
      // reenable_disabled_sources sẽ thử bật lại sau 24h cooldown.
      await supabase
        .from("electricity_sources")
        .update({
          last_crawled_at: new Date().toISOString(),
          consecutive_failures: newFails,
          last_error: msg.slice(0, 500),
          is_active: newFails < 10,
        })
        .eq("id", src.id);
    }
  };

  // Xử lý SOURCE_CONCURRENCY nguồn song song mỗi batch.
  // Batch chờ xong mới chạy batch tiếp → tôn trọng rate limit Anthropic + không tràn kết nối DB.
  const startTime = Date.now();
  try {
    for (let i = 0; i < srcList.length; i += SOURCE_CONCURRENCY) {
      if (Date.now() - startTime > TIME_BUDGET_MS) {
        stats.errors.push(`time budget ${TIME_BUDGET_MS}ms reached, stopped at source ${i}/${srcList.length}`);
        break;
      }
      const batch = srcList.slice(i, i + SOURCE_CONCURRENCY);
      await Promise.all(batch.map(processSource));
    }
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.error("crawl batch error:", msg, (e as Error)?.stack);
    stats.errors.push(`batch crash: ${msg}`);
  }
  const runMs = Date.now() - startTime;
  console.log(JSON.stringify({
    run_ms: runMs,
    sources: stats.sources,
    articles_found: stats.articlesFound,
    articles_inserted: stats.articlesInserted,
    errors_count: stats.errors.length,
    first_errors: stats.errors.slice(0, 3),
  }));

  return new Response(JSON.stringify({ ok: true, run_ms: runMs, ...stats }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
