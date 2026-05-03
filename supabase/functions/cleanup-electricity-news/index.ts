// Function one-shot: duyệt lại tin trong electricity_news, refetch URL gốc, parse
// meta tag ngày xuất bản. Xoá bài không xác định được ngày hoặc đăng quá 3 ngày.
// Update published_at cho bài giữ lại.
//
// Body params:
//   dry_run (bool, default TRUE): chỉ liệt kê việc sẽ làm, không xoá/update.
//   limit   (int, default 100):   số bài tối đa mỗi run, tránh wipe nhầm hàng loạt
//                                  khi 1 site nguồn tạm down.
//   apply   (bool):               alias để chạy thật (apply=true ⇔ dry_run=false).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15000;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

async function fetchWithTimeout(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LuotBot/1.0)" },
    });
  } finally {
    clearTimeout(t);
  }
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
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Default dry_run=true: phải explicit apply=true (hoặc dry_run=false) để xoá thật.
  let dryRun = true;
  let limit = DEFAULT_LIMIT;
  try {
    const body = await req.json();
    if (typeof body?.dry_run === "boolean") dryRun = body.dry_run;
    if (body?.apply === true) dryRun = false;
    if (typeof body?.limit === "number" && body.limit > 0) {
      limit = Math.min(Math.floor(body.limit), MAX_LIMIT);
    }
  } catch {
    // không có body, dùng default (dry-run, 100 rows)
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, serviceKey);

  // Quét theo crawled_at cũ nhất trước (bài lâu nhất có khả năng cao nhất là quá hạn).
  const { data: rows, error } = await supabase
    .from("electricity_news")
    .select("id, original_url, title, published_at")
    .order("crawled_at", { ascending: true })
    .limit(limit);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const now = Date.now();
  const toDelete: string[] = [];
  const deletePreview: { id: string; title: string; reason: string }[] = [];
  const toUpdate: { id: string; published_at: string }[] = [];
  const stats = {
    dry_run: dryRun,
    limit,
    scanned: rows?.length ?? 0,
    would_delete: 0,
    would_update: 0,
    deleted: 0,
    updated: 0,
    kept: 0,
    errors: [] as string[],
  };

  for (const row of rows ?? []) {
    try {
      const res = await fetchWithTimeout(row.original_url);
      if (!res.ok) {
        const reason = `HTTP ${res.status}`;
        stats.errors.push(`${row.title.slice(0, 40)}: ${reason} → ${dryRun ? "would delete" : "xoá"}`);
        toDelete.push(row.id);
        deletePreview.push({ id: row.id, title: row.title.slice(0, 80), reason });
        continue;
      }
      const html = await res.text();
      const metaDate = extractPublishedDateFromHtml(html);
      if (!metaDate) {
        const reason = "no meta date";
        stats.errors.push(`${row.title.slice(0, 40)}: ${reason} → ${dryRun ? "would delete" : "xoá"}`);
        toDelete.push(row.id);
        deletePreview.push({ id: row.id, title: row.title.slice(0, 80), reason });
        continue;
      }
      const age = now - new Date(metaDate).getTime();
      if (age > THREE_DAYS_MS) {
        const reason = `cũ (${metaDate.slice(0, 10)})`;
        stats.errors.push(`${row.title.slice(0, 40)}: ${reason} → ${dryRun ? "would delete" : "xoá"}`);
        toDelete.push(row.id);
        deletePreview.push({ id: row.id, title: row.title.slice(0, 80), reason });
        continue;
      }
      if (row.published_at !== metaDate) {
        toUpdate.push({ id: row.id, published_at: metaDate });
      }
      stats.kept++;
    } catch (e) {
      const reason = (e as Error).message;
      stats.errors.push(`${row.title.slice(0, 40)}: ${reason} → ${dryRun ? "would delete" : "xoá"}`);
      toDelete.push(row.id);
      deletePreview.push({ id: row.id, title: row.title.slice(0, 80), reason });
    }
  }

  stats.would_delete = toDelete.length;
  stats.would_update = toUpdate.length;

  if (!dryRun) {
    if (toDelete.length > 0) {
      const { error: delErr } = await supabase.from("electricity_news").delete().in("id", toDelete);
      if (delErr) stats.errors.push(`DELETE error: ${delErr.message}`);
      else stats.deleted = toDelete.length;
    }
    for (const u of toUpdate) {
      const { error: updErr } = await supabase
        .from("electricity_news")
        .update({ published_at: u.published_at })
        .eq("id", u.id);
      if (!updErr) stats.updated++;
    }
  }

  return new Response(
    JSON.stringify(
      {
        ...stats,
        ...(dryRun ? { delete_preview: deletePreview.slice(0, 50) } : {}),
      },
      null,
      2,
    ),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
