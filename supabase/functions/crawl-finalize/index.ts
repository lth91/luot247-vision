// HYBRID ĐỢT 1 (28/07) — nhịp 2 của pipeline crawl khi công tắc giám khảo
// local BẬT. Cron 5' gọi. Nhiệm vụ:
//   1. Job 'giam_khao_live' đã được worker Mac chấm (done) → áp phán quyết:
//      dat/dien_bien_moi/can_kiem_tra → INSERT news vào hàng đợi duyệt;
//      loai/trung → crawl_reject_log. Đánh dấu finalized.
//   2. Job quá 12' chưa ai chấm (Mac tắt/kẹt) → GỌI HAIKU chấm thay
//      (fallback). Haiku cũng lỗi → vào hàng đợi kèm nhãn cần kiểm tra
//      (fail-open — không bao giờ mất tin vì máy local vắng mặt).
// Công tắc TẮT → hàng đợi không có job live, function này no-op rẻ tiền.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { VERIFY_SYSTEM_PROMPT } from "../_shared/crawl-verify-prompt.ts";
import { logLlmUsage } from "../_shared/llm-usage.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const STALE_MS = 12 * 60 * 1000;   // job quá 12' chưa chấm → Haiku thay
const DONE_BATCH = 40;
const STALE_BATCH = 6;             // mỗi lượt tối đa 6 cú Haiku fallback

type Verdict = { verdict: string; reason?: string; new_info?: string };

// deno-lint-ignore no-explicit-any
type Job = Record<string, any>;

function suspectBlock(suspect: Job | null): string {
  if (!suspect || !suspect.title) return "";
  const simPct = Math.round(Number(suspect.sim ?? 0) * 100);
  const t = suspect.created_at ? `, đăng lúc ${String(suspect.created_at).slice(0, 16).replace("T", " ")}` : "";
  return `\n\nTIN ĐÃ ĐĂNG NGHI TRÙNG (điểm tương đồng ${simPct}%${t}):\n«${suspect.title}»`;
}

// Haiku chấm thay khi worker local vắng mặt — dựng userMsg y hệt crawl-news.
async function haikuVerify(job: Job, apiKey: string, supabase: ReturnType<typeof createClient>): Promise<Verdict | null> {
  const p = job.payload ?? {};
  const dateBlock = p.pub_date ? `\nNGÀY XUẤT BẢN (theo metadata bài gốc): ${p.pub_date}` : "";
  const userMsg = `BÀI BÁO GỐC\nTiêu đề: ${p.orig_title}${dateBlock}\nNội dung:\n${String(p.orig_content ?? "").slice(0, 4000)}\n\nBẢN TIN ĐÃ VIẾT\nTiêu đề: ${p.news_title}\nNội dung: ${p.news_content}${suspectBlock(p.suspect ?? null)}`;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL, max_tokens: 300, temperature: 0,
        system: [{ type: "text", text: VERIFY_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userMsg }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.usage) await logLlmUsage(supabase, { functionName: "crawl-news", model: ANTHROPIC_MODEL, usage: data.usage });
    const raw = (data?.content?.[0]?.text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? raw) as Record<string, unknown>;
    const v = String(parsed.verdict ?? "");
    if (!["dat", "loai", "trung", "dien_bien_moi", "can_kiem_tra"].includes(v)) return null;
    return { verdict: v, reason: String(parsed.reason ?? "").slice(0, 300), new_info: String(parsed.new_info ?? "").slice(0, 200) };
  } catch {
    return null;
  }
}

// Áp phán quyết cho 1 job ĐÃ claim (status=finalized). judgedBy: 'local'|'haiku-fallback'.
async function applyVerdict(supabase: ReturnType<typeof createClient>, job: Job, verdict: Verdict, judgedBy: string, stats: Record<string, number>): Promise<void> {
  const p = job.payload ?? {};
  const extra = job.extra ?? {};
  const v = verdict.verdict;

  if (v === "loai" || v === "trung") {
    const rc = extra.reject_ctx ?? {};
    const { error } = await supabase.from("crawl_reject_log").insert({
      stage: "kiem", verdict: v,
      source_name: rc.source_name ?? null, url: rc.url ?? null, url_hash: job.url_hash ?? null,
      original_title: rc.original_title ?? null, rewritten_title: p.news_title ?? null,
      reason: `${verdict.reason ?? ""} [${judgedBy}]`.trim(),
      ...(p.suspect && p.suspect.title
        ? { similar_news_id: p.suspect.id ?? null, similar_title: p.suspect.title, similar_sim: p.suspect.sim ?? null }
        : {}),
    });
    if (error) console.warn("finalize reject-log fail:", error.message);
    stats[v === "trung" ? "p1Dup" : "p1Rejected"]++;
    return;
  }

  // dat / dien_bien_moi / can_kiem_tra → vào hàng đợi duyệt
  const newDev = v === "dien_bien_moi";
  const needsCheck = v === "can_kiem_tra";
  const aic = { ...(extra.aic ?? {}), judged_by: judgedBy };
  const { error: insErr } = await supabase.from("news").insert({
    ...(extra.news_row ?? {}),
    ai_classification: {
      ...aic,
      ...(newDev ? { new_development: { note: verdict.new_info ?? "", similar_title: p.suspect?.title ?? "" } } : {}),
      ...(needsCheck ? { needs_check: verdict.reason || "Giám khảo không phản hồi — cần người kiểm kỹ" } : {}),
    },
  });
  if (insErr) {
    if (String(insErr.message).includes("duplicate")) stats.dupSkipped++;
    else { stats.insertErrors++; console.warn("finalize insert fail:", insErr.message); }
  } else {
    stats.inserted++;
    if (newDev) stats.p1NewDev++;
    if (needsCheck) stats.p1NeedsCheck++;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

  const stats: Record<string, number> = {
    finalized: 0, inserted: 0, p1Rejected: 0, p1Dup: 0, p1NewDev: 0, p1NeedsCheck: 0,
    haikuFallback: 0, dupSkipped: 0, insertErrors: 0, badVerdict: 0,
  };

  // ===== 1) Job worker đã chấm xong =====
  const { data: doneJobs } = await supabase.from("llm_shadow_queue")
    .select("*").eq("task", "giam_khao_live").eq("status", "done")
    .order("created_at", { ascending: true }).limit(DONE_BATCH);
  for (const job of doneJobs ?? []) {
    // Claim chống đúp: chỉ ai chuyển được done→finalized mới xử lý.
    const { data: claimed } = await supabase.from("llm_shadow_queue")
      .update({ status: "finalized" }).eq("id", job.id).eq("status", "done").select("id");
    if (!claimed || claimed.length === 0) continue;
    const v = (job.local_verdict ?? {}) as Verdict;
    if (!["dat", "loai", "trung", "dien_bien_moi", "can_kiem_tra"].includes(String(v.verdict))) {
      // verdict hỏng → fail-open: vào hàng đợi kèm nhãn cần kiểm tra
      stats.badVerdict++;
      await applyVerdict(supabase, job, { verdict: "can_kiem_tra", reason: "Verdict local không hợp lệ" }, "local", stats);
    } else {
      await applyVerdict(supabase, job, v, "local", stats);
    }
    stats.finalized++;
  }

  // ===== 2) Job quá hạn (Mac vắng mặt) → Haiku chấm thay =====
  const staleCutoff = new Date(Date.now() - STALE_MS).toISOString();
  const { data: staleJobs } = await supabase.from("llm_shadow_queue")
    .select("*").eq("task", "giam_khao_live").in("status", ["pending", "processing"])
    .lt("created_at", staleCutoff)
    .order("created_at", { ascending: true }).limit(STALE_BATCH);
  for (const job of staleJobs ?? []) {
    const { data: claimed } = await supabase.from("llm_shadow_queue")
      .update({ status: "finalized", model: "haiku-fallback", worker: "crawl-finalize" })
      .eq("id", job.id).in("status", ["pending", "processing"]).select("id");
    if (!claimed || claimed.length === 0) continue;
    let verdict: Verdict | null = anthropicKey ? await haikuVerify(job, anthropicKey, supabase) : null;
    if (!verdict) verdict = { verdict: "can_kiem_tra", reason: "Local vắng mặt, Haiku fallback không phản hồi" };
    else stats.haikuFallback++;
    await supabase.from("llm_shadow_queue").update({ local_verdict: verdict }).eq("id", job.id);
    await applyVerdict(supabase, job, verdict, "haiku-fallback", stats);
    stats.finalized++;
  }

  return new Response(JSON.stringify({ ok: true, ...stats }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
