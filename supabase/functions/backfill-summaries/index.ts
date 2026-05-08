// Backfill edge function: re-fetch + re-extract + re-summarize các electricity_news cũ
// với prompt mới (format ngày tự nhiên, năm đúng). One-off maintenance, có thể xoá sau khi chạy xong.
//
// Usage (SQL Editor):
//   SELECT net.http_post(
//     url := 'https://gklpvaindbfkcmuuuffz.supabase.co/functions/v1/backfill-summaries',
//     headers := jsonb_build_object('Authorization','Bearer <SERVICE_ROLE_KEY>','apikey','<SERVICE_ROLE_KEY>','Content-Type','application/json'),
//     body := '{"limit": 50, "days": 3}'::jsonb
//   );
//
// Hoặc trực tiếp curl:
//   curl -X POST https://gklpvaindbfkcmuuuffz.supabase.co/functions/v1/backfill-summaries \
//     -H "Authorization: Bearer <anon_key>" \
//     -H "Content-Type: application/json" \
//     -d '{"limit": 50, "days": 3}'

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { logLlmUsage } from "../_shared/llm-usage.ts";
import { DOMParser, Element } from "https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const MODEL = "claude-haiku-4-5-20251001";
const MAX_CONTENT_CHARS = 8000;
const FETCH_TIMEOUT_MS = 20000;
const CONCURRENCY = 3;

const SUMMARIZE_SYSTEM_PROMPT = `Bạn là biên tập viên tin tức chuyên ngành điện Việt Nam. Nhiệm vụ: đọc bài báo và trả về JSON gồm ngày xuất bản + tóm tắt.

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

async function fetchWithTimeout(url: string, ms = FETCH_TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, "Accept-Language": "vi,en;q=0.8" },
      redirect: "follow",
    });
  } finally { clearTimeout(t); }
}

function extractArticleContent(html: string): { content: string } {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) return { content: "" };

  const selectors = [
    "[itemprop='articleBody']",
    "[class*='article-content']", "[class*='article__body']", "[class*='article-body']",
    "[class*='detail__content']", "[class*='detail-content']", "[class*='content-detail']",
    "[class*='news-detail']", "[class*='main-detail']", "[class*='singular-content']",
    "[class*='fck_detail']", "[class*='post-body']", "[class*='entry-content']",
    "[class*='zone__content']", "[class*='general-item_content']",
    "article",
  ];

  let contentEl: Element | null = null;
  let maxLen = 0;
  for (const sel of selectors) {
    try {
      doc.querySelectorAll(sel).forEach((el) => {
        const len = (el.textContent || "").trim().length;
        if (len > maxLen && len > 300) {
          contentEl = el as Element;
          maxLen = len;
        }
      });
      if (contentEl) break;
    } catch { /* ignore */ }
  }

  let content = "";
  if (contentEl) {
    contentEl.querySelectorAll("script, style, iframe, nav, footer, aside, .advertisement, .related-news, .box-tags, .author-info, .box-related, .related-articles, .sidebar, .banner").forEach((n) => (n as Element).remove());
    content = contentEl.textContent || "";
  }

  if (content.length < 300) {
    const ogDesc = doc.querySelector("meta[property='og:description']")?.getAttribute("content") || "";
    const metaDesc = doc.querySelector("meta[name='description']")?.getAttribute("content") || "";
    const desc = (ogDesc.length > metaDesc.length ? ogDesc : metaDesc).trim();
    if (desc.length > 150) content = desc;
  }

  if (content.length < 300) {
    const mainEl = doc.querySelector("main") || doc.querySelector("article") || doc.body;
    const ps: string[] = [];
    mainEl?.querySelectorAll("p").forEach((p) => {
      const t = (p.textContent || "").trim();
      if (t.length > 40) ps.push(t);
    });
    content = ps.join("\n");
  }

  return { content: content.replace(/\s+/g, " ").trim().slice(0, MAX_CONTENT_CHARS) };
}

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

async function summarize(title: string, content: string, apiKey: string, knownPubDate: string | null) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const dateHint = knownPubDate
    ? `\n\nNgày xuất bản đã xác định từ metadata: ${knownPubDate}. Dùng đúng ngày/tháng/NĂM này khi nhắc mốc thời gian trong summary, KHÔNG đoán năm khác.`
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
      model: MODEL,
      max_tokens: 700,
      system: SUMMARIZE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMsg }],
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const raw: string = (data?.content?.[0]?.text ?? "").trim();
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const p = JSON.parse(m[0]);
    const summary = String(p.summary ?? "").trim();
    const pd = p.published_date;
    const publishedDate = typeof pd === "string" && /^\d{4}-\d{2}-\d{2}$/.test(pd) ? pd : null;
    return { summary, publishedDate, usage: data.usage };
  } catch { return null; }
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(parseInt(body.limit ?? 30, 10), 100);
    const days = Math.min(parseInt(body.days ?? 3, 10), 30);
    const onlyBadFormat = body.only_bad_format !== false; // default true

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    let q = supabase
      .from("electricity_news")
      .select("id, title, original_url, published_at, summary")
      .gte("crawled_at", threshold)
      .order("crawled_at", { ascending: false })
      .limit(limit);
    const { data: rows, error } = await q;
    if (error) throw error;

    // Filter: chỉ bài format summary xấu (stiff date, apology, không có natural prefix)
    // Pattern bad: "DD/MM/YYYY" (stiff), apology, hoặc không bắt đầu với date natural
    const naturalPrefix = /^(Sáng|Chiều|Tối|Trưa|Đêm|Ngày|Năm|Quý|Tuần|Đầu|Cuối|Giữa|Hôm|Dự kiến|Đến|\d{1,2}\/\d{1,2})(?!\/\d{4})/;
    const targets = onlyBadFormat
      ? rows.filter((r) => !naturalPrefix.test(r.summary ?? "") || isInvalidSummary(r.summary ?? "") || /Ngày \d{1,2}\/\d{1,2}\/\d{4}/.test(r.summary ?? ""))
      : rows;

    const stats = { total: targets.length, updated: 0, skipped: 0, errors: [] as string[], totalIn: 0, totalOut: 0 };

    const queue = [...targets];
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        const r = queue.shift();
        if (!r) return;
        try {
          const res = await fetchWithTimeout(r.original_url);
          if (!res.ok) { stats.errors.push(`${r.id}: HTTP ${res.status}`); stats.skipped++; continue; }
          const html = await res.text();
          const { content } = extractArticleContent(html);
          if (!content || content.length < 200) {
            stats.errors.push(`${r.id}: short content (${content.length})`);
            stats.skipped++;
            continue;
          }
          const pubIso = r.published_at ? r.published_at.slice(0, 10) : null;
          const s = await summarize(r.title, content, anthropicKey, pubIso);
          if (!s || !s.summary || isInvalidSummary(s.summary)) {
            stats.errors.push(`${r.id}: bad/empty summary`);
            stats.skipped++;
            continue;
          }
          stats.totalIn += s.usage?.input_tokens ?? 0;
          stats.totalOut += s.usage?.output_tokens ?? 0;
          if (s.usage) {
            await logLlmUsage(supabase, {
              functionName: "backfill-summaries",
              model: MODEL,
              usage: s.usage,
            });
          }
          const wc = wordCount(s.summary);
          const newPub = s.publishedDate ? `${s.publishedDate}T00:00:00Z` : r.published_at;
          const { error: uErr } = await supabase
            .from("electricity_news")
            .update({ summary: s.summary, summary_word_count: wc, published_at: newPub })
            .eq("id", r.id);
          if (uErr) { stats.errors.push(`${r.id}: ${uErr.message}`); stats.skipped++; }
          else stats.updated++;
        } catch (e) {
          stats.errors.push(`${r.id}: ${(e as Error).message}`);
          stats.skipped++;
        }
      }
    });
    await Promise.all(workers);

    const cost = (stats.totalIn * 1 / 1_000_000) + (stats.totalOut * 5 / 1_000_000);
    return new Response(JSON.stringify({ ok: true, stats, cost_usd: Number(cost.toFixed(4)) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
