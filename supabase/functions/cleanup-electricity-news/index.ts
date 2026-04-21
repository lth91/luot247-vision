// Function one-shot: duyệt lại tất cả tin hiện có trong electricity_news,
// refetch URL gốc, parse meta tag ngày xuất bản. Xoá bài không xác định được
// ngày hoặc đăng quá 3 ngày. Update published_at cho bài giữ lại.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15000;

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

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: rows, error } = await supabase
    .from("electricity_news")
    .select("id, original_url, title, published_at");
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const now = Date.now();
  const toDelete: string[] = [];
  const toUpdate: { id: string; published_at: string }[] = [];
  const stats = {
    total: rows?.length ?? 0,
    deleted: 0,
    kept: 0,
    updated: 0,
    errors: [] as string[],
  };

  for (const row of rows ?? []) {
    try {
      const res = await fetchWithTimeout(row.original_url);
      if (!res.ok) {
        stats.errors.push(`${row.title.slice(0, 40)}: HTTP ${res.status} → xoá`);
        toDelete.push(row.id);
        continue;
      }
      const html = await res.text();
      const metaDate = extractPublishedDateFromHtml(html);
      if (!metaDate) {
        stats.errors.push(`${row.title.slice(0, 40)}: không parse được ngày → xoá`);
        toDelete.push(row.id);
        continue;
      }
      const age = now - new Date(metaDate).getTime();
      if (age > THREE_DAYS_MS) {
        stats.errors.push(`${row.title.slice(0, 40)}: ${metaDate.slice(0, 10)} (cũ) → xoá`);
        toDelete.push(row.id);
        continue;
      }
      if (row.published_at !== metaDate) {
        toUpdate.push({ id: row.id, published_at: metaDate });
      }
      stats.kept++;
    } catch (e) {
      stats.errors.push(`${row.title.slice(0, 40)}: ${(e as Error).message} → xoá`);
      toDelete.push(row.id);
    }
  }

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

  return new Response(JSON.stringify(stats, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
