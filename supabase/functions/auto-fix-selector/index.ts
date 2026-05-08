// Phase G — AI auto-fix selector agent (cron 04:00 UTC daily).
//
// Detect Tier 1/2 source với consecutive_failures ≥ 3 + 'no candidates parsed'
// → fetch list_url, sample link, gửi Claude Haiku đề xuất regex pattern mới,
// test ≥5 match → apply + reset fails. Telegram alert mọi attempt.
//
// Out of scope: tier 3 (chỉ disable, không tốn LLM cost).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { logLlmUsage } from "../_shared/llm-usage.ts";
import { sendTelegram } from "../_shared/telegram.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

const FAIL_THRESHOLD = 3;
const MIN_PATTERN_MATCH = 5;
const MIN_CONFIDENCE = 0.7;
const FETCH_TIMEOUT_MS = 15000;
const MAX_HTML_SIZE = 200000; // 200KB
const MAX_LINKS_TO_LLM = 30;

type SourceRow = {
  id: string;
  name: string;
  list_url: string;
  list_link_pattern: string | null;
  tier: number;
  consecutive_failures: number;
  last_error: string | null;
};

type FixResult = {
  source_id: string;
  source_name: string;
  result: "applied" | "rejected_low_confidence" | "rejected_no_match" | "rejected_llm_fail" | "rejected_fetch_fail";
  old_pattern: string | null;
  new_pattern: string | null;
  llm_confidence: number | null;
  llm_reason: string | null;
  test_match_count: number;
};

function extractCandidateLinks(html: string, baseUrl: string): string[] {
  const seen = new Set<string>();
  const links: string[] = [];
  const baseHost = (() => {
    try { return new URL(baseUrl).host; } catch { return ""; }
  })();
  const matches = html.match(/<a[^>]+href=["']([^"']+)["'][^>]*>/gi) || [];
  for (const m of matches) {
    const hrefMatch = m.match(/href=["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    const href = hrefMatch[1];
    let abs: URL;
    try { abs = new URL(href, baseUrl); } catch { continue; }
    if (abs.host !== baseHost) continue; // chỉ same-domain
    const path = abs.pathname;
    if (seen.has(path)) continue;
    if (path.length < 10) continue; // skip short paths (nav)
    if (!/\.(htm|html|chn)$|\/[a-z0-9-]{15,}-\d{5,}/.test(path)) continue; // article-like
    seen.add(path);
    links.push(path);
    if (links.length >= 80) break;
  }
  return links;
}

async function llmSuggestPattern(
  sourceName: string,
  links: string[],
  oldPattern: string | null,
  apiKey: string,
  supabase: ReturnType<typeof createClient> | null = null,
): Promise<{ pattern: string | null; confidence: number; reason: string }> {
  const sample = links.slice(0, MAX_LINKS_TO_LLM).map((l) => `  ${l}`).join("\n");
  const userMsg = `Source: ${sourceName}
Old regex (broken, matches 0 links): ${oldPattern ?? "NULL"}

Đây là ${links.length} link từ trang section. Đề xuất regex (PostgreSQL/JS) match URL của bài chi tiết, KHÔNG match nav/category/tag/section page.

Sample links:
${sample}

Trả JSON thuần (không markdown):
{"pattern": "regex string", "confidence": 0-1, "reason": "≤15 từ"}

Yêu cầu pattern:
- Match path URL (vd "/abc-123.htm"), không match scheme/domain
- Loại nav (vd /tag/, /category/, /section/, /tin-moi-nhat.htm, paths ngắn)
- Bài detail thường có ID hoặc timestamp dài cuối path
- Không quá lỏng (vd ".+" sai), không quá chặt
- Escape backslash đúng cho JSON (vd \\\\d, \\\\.)`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 500,
      messages: [{ role: "user", content: userMsg }],
    }),
  });
  if (!res.ok) {
    return { pattern: null, confidence: 0, reason: `llm_http_${res.status}` };
  }
  const data = await res.json();
  if (supabase && data?.usage) {
    await logLlmUsage(supabase, {
      functionName: "auto-fix-selector",
      model: ANTHROPIC_MODEL,
      usage: data.usage,
    });
  }
  const text: string = data?.content?.[0]?.text ?? "";
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return { pattern: null, confidence: 0, reason: "no_json" };
  try {
    const p = JSON.parse(m[0]);
    return {
      pattern: typeof p.pattern === "string" ? p.pattern : null,
      confidence: typeof p.confidence === "number" ? p.confidence : 0,
      reason: typeof p.reason === "string" ? p.reason.slice(0, 100) : "",
    };
  } catch {
    return { pattern: null, confidence: 0, reason: "parse_fail" };
  }
}

function testPattern(pattern: string, links: string[]): number {
  try {
    const re = new RegExp(pattern);
    let count = 0;
    for (const l of links) if (re.test(l)) count++;
    return count;
  } catch {
    return -1; // invalid regex
  }
}

async function fixOne(
  supabase: ReturnType<typeof createClient>,
  source: SourceRow,
  apiKey: string,
): Promise<FixResult> {
  const base: Pick<FixResult, "source_id" | "source_name" | "old_pattern" | "new_pattern" | "llm_confidence" | "llm_reason" | "test_match_count"> = {
    source_id: source.id,
    source_name: source.name,
    old_pattern: source.list_link_pattern,
    new_pattern: null,
    llm_confidence: null,
    llm_reason: null,
    test_match_count: 0,
  };

  // 1. Fetch list_url
  let html: string;
  try {
    const res = await fetch(source.list_url, {
      headers: { "User-Agent": UA, "Accept-Language": "vi,en;q=0.8" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
    });
    if (!res.ok) {
      return { ...base, result: "rejected_fetch_fail", llm_reason: `HTTP ${res.status}` };
    }
    html = (await res.text()).slice(0, MAX_HTML_SIZE);
  } catch (e) {
    return { ...base, result: "rejected_fetch_fail", llm_reason: (e as Error).message.slice(0, 100) };
  }

  // 2. Extract candidate links
  const links = extractCandidateLinks(html, source.list_url);
  if (links.length < MIN_PATTERN_MATCH) {
    return { ...base, result: "rejected_no_match", llm_reason: `only ${links.length} candidate links extracted` };
  }

  // 3. LLM suggest pattern
  const suggestion = await llmSuggestPattern(source.name, links, source.list_link_pattern, apiKey, supabase);
  if (!suggestion.pattern) {
    return { ...base, result: "rejected_llm_fail", llm_reason: suggestion.reason, llm_confidence: suggestion.confidence };
  }

  // 4. Test pattern
  const matchCount = testPattern(suggestion.pattern, links);
  if (matchCount < MIN_PATTERN_MATCH) {
    return {
      ...base,
      result: matchCount < 0 ? "rejected_llm_fail" : "rejected_no_match",
      new_pattern: suggestion.pattern,
      llm_confidence: suggestion.confidence,
      llm_reason: suggestion.reason,
      test_match_count: Math.max(matchCount, 0),
    };
  }

  if (suggestion.confidence < MIN_CONFIDENCE) {
    return {
      ...base,
      result: "rejected_low_confidence",
      new_pattern: suggestion.pattern,
      llm_confidence: suggestion.confidence,
      llm_reason: suggestion.reason,
      test_match_count: matchCount,
    };
  }

  // 5. Apply: UPDATE list_link_pattern, reset failures
  await supabase
    .from("electricity_sources")
    .update({
      list_link_pattern: suggestion.pattern,
      consecutive_failures: 0,
      last_error: `auto-fix ${new Date().toISOString().slice(0, 10)}: pattern updated by AI (conf=${suggestion.confidence})`,
    })
    .eq("id", source.id);

  return {
    ...base,
    result: "applied",
    new_pattern: suggestion.pattern,
    llm_confidence: suggestion.confidence,
    llm_reason: suggestion.reason,
    test_match_count: matchCount,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const tgToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const tgChatId = Deno.env.get("TELEGRAM_CHAT_ID");
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY missing" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Detect candidates: T1/T2 active + fails ≥ 3 + no_candidates_parsed pattern
  const { data: candidates } = await supabase
    .from("electricity_sources")
    .select("id, name, list_url, list_link_pattern, tier, consecutive_failures, last_error")
    .eq("is_active", true)
    .in("tier", [1, 2])
    .gte("consecutive_failures", FAIL_THRESHOLD)
    .ilike("last_error", "%no candidates parsed%")
    .eq("feed_type", "html_list");

  const results: FixResult[] = [];
  for (const c of (candidates ?? []) as SourceRow[]) {
    const res = await fixOne(supabase, c, apiKey);
    results.push(res);
    await supabase.from("selector_fix_log").insert({
      source_id: res.source_id,
      source_name: res.source_name,
      old_pattern: res.old_pattern,
      new_pattern: res.new_pattern,
      llm_confidence: res.llm_confidence,
      llm_reason: res.llm_reason,
      test_match_count: res.test_match_count,
      applied: res.result === "applied",
      result: res.result,
    });
  }

  // Telegram nếu có ≥1 attempt
  if (results.length > 0 && tgToken && tgChatId) {
    const applied = results.filter((r) => r.result === "applied");
    const rejected = results.filter((r) => r.result !== "applied");
    const lines: string[] = [];
    if (applied.length > 0) {
      lines.push(`✨ *Auto-fix applied (${applied.length}):*`);
      applied.forEach((r) => {
        lines.push(`  • ${r.source_name}: matched ${r.test_match_count} links (conf=${r.llm_confidence})`);
      });
    }
    if (rejected.length > 0) {
      lines.push(`⚠️ *Auto-fix rejected (${rejected.length}):*`);
      rejected.forEach((r) => {
        lines.push(`  • ${r.source_name}: ${r.result} — ${r.llm_reason ?? ""}`);
      });
    }
    try {
      await sendTelegram(tgToken, tgChatId, `🤖 *luot247.com/d auto-fix selector report*\n\n${lines.join("\n")}`);
    } catch { /* ignore Telegram error */ }
  }

  return new Response(
    JSON.stringify({ ok: true, attempts: results.length, results }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
