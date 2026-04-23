#!/usr/bin/env node
// Regenerate summary cho electricity_news cũ với prompt mới (format ngày tự nhiên).
// Chạy local trên Mac (IP VN) để tránh geo-block.
//
// Usage:
//   export ANTHROPIC_API_KEY="sk-ant-..."
//   export SUPABASE_URL="https://gklpvaindbfkcmuuuffz.supabase.co"
//   export SUPABASE_SERVICE_KEY="eyJhbGci..."        # service role key
//   node scripts/regenerate-summaries.mjs
//
// Flags:
//   DAYS=7           # tính ngược từ now (default 7)
//   LIMIT=200        # giới hạn số bài xử lý (default 200)
//   DRY_RUN=1        # in ra không update DB
//   CONCURRENCY=3    # số request song song (default 3)

import { createClient } from "@supabase/supabase-js";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL || "https://gklpvaindbfkcmuuuffz.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const DAYS = parseInt(process.env.DAYS ?? "7", 10);
const LIMIT = parseInt(process.env.LIMIT ?? "200", 10);
const DRY_RUN = !!process.env.DRY_RUN;
const CONCURRENCY = parseInt(process.env.CONCURRENCY ?? "3", 10);

if (!ANTHROPIC_API_KEY) { console.error("Missing ANTHROPIC_API_KEY"); process.exit(1); }
if (!SUPABASE_SERVICE_KEY) { console.error("Missing SUPABASE_SERVICE_KEY"); process.exit(1); }

const MODEL = "claude-haiku-4-5-20251001";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36";
const MAX_CONTENT = 8000;

const SYSTEM_PROMPT = `Bạn là biên tập viên tin tức chuyên ngành điện Việt Nam. Nhiệm vụ: đọc bài báo và trả về JSON gồm ngày xuất bản + tóm tắt.

ĐỊNH DẠNG ĐẦU RA BẮT BUỘC (JSON thuần, không markdown, không giải thích):
{"published_date": "YYYY-MM-DD hoặc null", "summary": "..."}

QUY TẮC:
- published_date: ngày xuất bản bài. Dạng YYYY-MM-DD. Không đoán.
- summary: tóm tắt dưới 150 từ bằng tiếng Việt, văn phong tin tức chuyên ngành, khách quan.

QUAN TRỌNG — MỞ ĐẦU SUMMARY BẰNG MỐC THỜI GIAN TỰ NHIÊN:
  + Nếu bài nêu rõ buổi/ngày cụ thể: dùng "Sáng 22/4", "Chiều 22/4", "Tối 22/4", "Trưa 22/4", "Đêm 22/4". KHÔNG kèm năm trừ khi bài là sự kiện quá khứ xa hoặc kế hoạch tương lai.
  + Nếu chỉ có ngày (không có buổi): dùng "Ngày 22/4" hoặc "22/4".
  + Nếu là xu hướng/thống kê cả kỳ: dùng "Năm 2025", "Quý I/2026", "Tuần qua", "Đầu tháng 4/2026".
  + Nếu là dự kiến: dùng "Dự kiến tháng 6/2026", "Đến 2030".
  + TUYỆT ĐỐI không dùng định dạng khô cứng "Ngày 22/04/2026" hay "Vào ngày 22/4/2026".
  + Không lặp lại tiêu đề, không mở đầu "Bài báo nói về…", "Theo bài viết…".`;

// Selectors ưu tiên — thêm vneconomy, nhandan và các báo VN phổ biến
const SELECTORS = [
  // Specific classes theo site
  '[class*="main-detail"]',
  '[class*="singular-content"]',
  '[class*="detail__content"]',
  '[class*="article-content"]',
  '[class*="article__body"]',
  '[class*="content-detail"]',
  '[class*="news-detail"]',
  '[class*="fck_detail"]',
  '[class*="detail-content"]',
  // Microdata / semantic
  '[itemprop="articleBody"]',
  "article",
  "main article",
  "main",
  "div.content",
];

// Extract content from HTML using simple regex-based approach (no DOMParser in node without extra dep)
// We'll use a minimal DOM lib: linkedom (if available) or fallback to regex.
async function extractContent(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  // Try meta og:description as backup
  const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] || "";
  const metaDesc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] || "";

  // Try to find a specific article container via regex
  // Heuristic: find <div class="...main-detail..." ...>...</div> or <article>...</article>
  let content = "";

  // Try to extract <article>...</article> block first
  const articleMatch = html.match(/<article[^>]*>([\s\S]{500,}?)<\/article>/i);
  if (articleMatch) {
    content = stripHtmlKeepText(articleMatch[1]);
  }

  // Fallback: find div with class containing "main-detail" or "article-content"
  if (content.length < 300) {
    const patterns = [
      /<div[^>]+class=["'][^"']*main-detail[^"']*["'][^>]*>([\s\S]{500,}?)<\/div>\s*<\/div>\s*<\/div>/i,
      /<div[^>]+class=["'][^"']*singular-content[^"']*["'][^>]*>([\s\S]{500,}?)<\/div>\s*<\/div>/i,
      /<div[^>]+class=["'][^"']*article-content[^"']*["'][^>]*>([\s\S]{500,}?)<\/div>\s*<\/div>/i,
      /<div[^>]+class=["'][^"']*detail__content[^"']*["'][^>]*>([\s\S]{500,}?)<\/div>\s*<\/div>/i,
      /<div[^>]+class=["'][^"']*content-detail[^"']*["'][^>]*>([\s\S]{500,}?)<\/div>/i,
      /<div[^>]+itemprop=["']articleBody["'][^>]*>([\s\S]{500,}?)<\/div>\s*<\/div>/i,
    ];
    for (const p of patterns) {
      const m = html.match(p);
      if (m && m[1]) {
        const text = stripHtmlKeepText(m[1]);
        if (text.length > content.length) content = text;
      }
    }
  }

  // Last resort: concat all <p> with length > 40
  if (content.length < 300) {
    const paragraphs = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
      .map((m) => stripHtmlKeepText(m[1]))
      .filter((t) => t.length > 40);
    content = paragraphs.join("\n");
  }

  // Clip
  content = content.slice(0, MAX_CONTENT);
  return { content, ogDesc, metaDesc };
}

function stripHtmlKeepText(s) {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/\s+/g, " ")
    .trim();
}

async function summarize(title, content, knownPublishedDate = null) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const dateHint = knownPublishedDate
    ? `\n\nNgày xuất bản đã xác định từ metadata: ${knownPublishedDate}. Dùng đúng ngày/tháng/NĂM này khi nhắc mốc thời gian trong summary, KHÔNG đoán năm khác.`
    : `\n\nKhông có ngày từ metadata. Nếu bài chỉ ghi "ngày 20/4" không kèm năm, mặc định là năm ${todayIso.slice(0, 4)} (hôm nay là ${todayIso}).`;
  const userMsg = `Tiêu đề: ${title}\n\nNội dung:\n${content}${dateHint}`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMsg }],
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const raw = (data?.content?.[0]?.text ?? "").trim();
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const p = JSON.parse(m[0]);
    const summary = String(p.summary ?? "").trim();
    const pd = p.published_date;
    const publishedDate = typeof pd === "string" && /^\d{4}-\d{2}-\d{2}$/.test(pd) ? pd : null;
    return { summary, publishedDate, tokens: data.usage };
  } catch {
    return null;
  }
}

async function pool(items, concurrency, worker) {
  let idx = 0;
  const results = [];
  async function runner() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, runner));
  return results;
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const threshold = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();

  console.log(`\n=== Regenerate summaries (DAYS=${DAYS}, LIMIT=${LIMIT}, DRY_RUN=${DRY_RUN}) ===\n`);

  const { data: rows, error } = await supabase
    .from("electricity_news")
    .select("id, title, original_url, published_at, summary, summary_word_count")
    .gte("crawled_at", threshold)
    .order("crawled_at", { ascending: false })
    .limit(LIMIT);
  if (error) { console.error(error); process.exit(1); }
  console.log(`Fetched ${rows.length} rows to regenerate.\n`);

  let totalIn = 0, totalOut = 0, updated = 0, errors = 0, skipped = 0;

  await pool(rows, CONCURRENCY, async (r, i) => {
    try {
      const { content } = await extractContent(r.original_url);
      if (!content || content.length < 200) {
        console.log(`  [${i + 1}/${rows.length}] SKIP (short ${content.length}) — ${r.title.slice(0, 60)}`);
        skipped++;
        return;
      }
      const pubIso = r.published_at ? r.published_at.slice(0, 10) : null;
      const result = await summarize(r.title, content, pubIso);
      if (!result || !result.summary) {
        console.log(`  [${i + 1}/${rows.length}] SKIP (no summary) — ${r.title.slice(0, 60)}`);
        skipped++;
        return;
      }
      totalIn += result.tokens?.input_tokens ?? 0;
      totalOut += result.tokens?.output_tokens ?? 0;

      const wc = result.summary.trim().split(/\s+/).filter(Boolean).length;
      const newPub = result.publishedDate ? `${result.publishedDate}T00:00:00Z` : r.published_at;

      if (DRY_RUN) {
        console.log(`  [${i + 1}/${rows.length}] (dry) ${r.title.slice(0, 60)}`);
        console.log(`      OLD: ${(r.summary || "").slice(0, 100)}`);
        console.log(`      NEW: ${result.summary.slice(0, 100)}`);
      } else {
        const { error: uErr } = await supabase
          .from("electricity_news")
          .update({ summary: result.summary, summary_word_count: wc, published_at: newPub })
          .eq("id", r.id);
        if (uErr) { console.log(`  [${i + 1}/${rows.length}] UPDATE FAIL: ${uErr.message}`); errors++; return; }
        updated++;
        if (i % 10 === 0 || i === rows.length - 1) {
          console.log(`  [${i + 1}/${rows.length}] OK — ${r.title.slice(0, 60)}`);
        }
      }
    } catch (e) {
      console.log(`  [${i + 1}/${rows.length}] ERROR ${e.message} — ${r.title.slice(0, 60)}`);
      errors++;
    }
  });

  const cost = (totalIn * 1 / 1_000_000) + (totalOut * 5 / 1_000_000);
  console.log(`\n=== Summary ===`);
  console.log(`Updated: ${updated}, Skipped: ${skipped}, Errors: ${errors}`);
  console.log(`Tokens: in=${totalIn}, out=${totalOut}`);
  console.log(`Cost: $${cost.toFixed(4)}`);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
