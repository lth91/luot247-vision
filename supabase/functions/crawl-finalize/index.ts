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
import { BULK_CLASSIFY_SYSTEM, buildBulkUserMsg } from "../_shared/bulk-classify-prompt.ts";
import { logLlmUsage } from "../_shared/llm-usage.ts";
import { splitIntoTwoParagraphs } from "../_shared/word-count.ts";
import { isValidCategory } from "../_shared/news-categories.ts";

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

// ===== LÔ PHÂN LOẠI BULK (31/07, phương án B) =====
// Chuẩn hóa verdict lô: worker local trả {"items":[...]}, Haiku trả mảng trần.
function normalizeBatchItems(v: unknown): Job[] {
  if (Array.isArray(v)) return v as Job[];
  if (v && typeof v === "object" && Array.isArray((v as Job).items)) return (v as Job).items as Job[];
  return [];
}

// Haiku chấm thay 1 lô khi worker local vắng — prompt dùng chung với bulk.
async function haikuClassifyBatch(job: Job, apiKey: string, supabase: ReturnType<typeof createClient>): Promise<Job[] | null> {
  const items = ((job.payload ?? {}).items ?? []) as { title: string; content: string }[];
  if (items.length === 0) return [];
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL, max_tokens: 1500, temperature: 0.2,
        system: [{ type: "text", text: BULK_CLASSIFY_SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: buildBulkUserMsg(items) }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.usage) await logLlmUsage(supabase, { functionName: "submit-news-bulk", model: ANTHROPIC_MODEL, usage: data.usage });
    const raw = (data?.content?.[0]?.text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
    const arr = JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0] ?? raw);
    return Array.isArray(arr) ? arr as Job[] : null;
  } catch {
    return null;
  }
}

// Áp ngưỡng + đăng/loại cho 1 lô ĐÃ claim. Ngưỡng GIỮ Y HỆT submit-news-bulk
// bước 6 (đổi bên đó thì đổi cả đây). judgedBy: 'local' | 'haiku-fallback'.
async function applyBatchVerdict(
  supabase: ReturnType<typeof createClient>,
  job: Job,
  verdictItems: Job[],
  judgedBy: string,
  stats: Record<string, number>,
): Promise<void> {
  const items = ((job.payload ?? {}).items ?? []) as { i: number; title: string; content: string }[];
  const userId = (job.extra ?? {}).user_id as string | undefined;
  if (!userId) { stats.batchNoUser++; return; }
  const byIdx = new Map<number, Job>();
  for (const el of verdictItems) {
    if (typeof el?.i === "number") byIdx.set(el.i, el);
  }
  const logs: Record<string, unknown>[] = [];
  for (const it of items) {
    const v = byIdx.get(it.i);
    const vi = (v?.vi && typeof v.vi === "object" ? v.vi : {}) as Record<string, string>;
    const viR = (k: string) => (typeof vi[k] === "string" && vi[k] ? String(vi[k]).slice(0, 100) : "");
    if (!v || typeof v.cat !== "string") {
      logs.push({ user_id: userId, status: "error", title: it.title.slice(0, 200), reject_reason: "AI không trả kết quả — nộp lại dòng này", penalized: false });
      stats.batchErrors++;
      continue;
    }
    const reason =
      (v.aig === true && Number(v.ac ?? 0) >= 0.8) ? { st: "rejected_ai", r: "Dấu hiệu nội dung do AI viết — viết lại văn phong tự nhiên" } :
      viR("plaus") ? { st: "rejected_implausible", r: "Nội dung khả nghi/khó kiểm chứng — xem lại" } :
      viR("ad") ? { st: "rejected_quality", r: `Thiên về quảng cáo/PR: ${viR("ad")} — bỏ phần quảng bá, giữ phần tin` } :
      viR("facts") ? { st: "rejected_quality", r: `Thiếu dữ kiện cốt lõi: ${viR("facts")} — bổ sung chủ thể/diễn biến/thời điểm` } :
      viR("sens") ? { st: "rejected_quality", r: `Giọng giật gân: ${viR("sens")} — viết lại trung tính, thay cảm thán bằng dữ kiện` } :
      viR("legal") ? { st: "rejected_quality", r: `Rủi ro pháp lý: ${viR("legal")} — dùng "bị cáo buộc"/"đang điều tra" đúng tình trạng` } :
      null;
    if (reason) {
      logs.push({ user_id: userId, status: reason.st, title: it.title.slice(0, 200), reject_reason: reason.r, penalized: false });
      stats.batchRejected++;
      continue;
    }
    const category = isValidCategory(String(v.cat)) ? String(v.cat) : "xa-hoi-van-hoa";
    const cc = Number(v.cc ?? 0);
    const { data: ins, error: insErr } = await supabase.from("news").insert({
      title: it.title,
      description: splitIntoTwoParagraphs(it.content),
      category,
      is_approved: true,
      submitted_by: userId,
      ai_classification: {
        category, category_confidence: cc, category_confidence_low: cc < 0.5,
        is_ai_generated: v.aig === true, ai_confidence: Number(v.ac ?? 0),
        is_plausible: !viR("plaus"), bulk: true, judged_by: judgedBy,
      },
    }).select("id").single();
    if (insErr || !ins) { stats.batchErrors++; continue; }
    logs.push({ user_id: userId, news_id: ins.id, status: "accepted", title: it.title.slice(0, 200) });
    stats.batchAccepted++;
  }
  if (logs.length > 0) {
    const { error } = await supabase.from("submission_log").insert(logs);
    if (error) console.warn("finalize submission_log fail:", error.message);
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
    batchFinalized: 0, batchAccepted: 0, batchRejected: 0, batchErrors: 0,
    batchHaikuFallback: 0, batchRetryLater: 0, batchNoUser: 0,
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
  // Gồm cả status 'error' (worker chấm hỏng/parse fail) — không thì job lỗi
  // mồ côi vĩnh viễn và BÀI TIN BỊ MẤT (url_hash còn giữ chỗ chống re-crawl).
  const staleCutoff = new Date(Date.now() - STALE_MS).toISOString();
  const { data: staleJobs } = await supabase.from("llm_shadow_queue")
    .select("*").eq("task", "giam_khao_live").in("status", ["pending", "processing", "error"])
    .lt("created_at", staleCutoff)
    .order("created_at", { ascending: true }).limit(STALE_BATCH);
  for (const job of staleJobs ?? []) {
    const { data: claimed } = await supabase.from("llm_shadow_queue")
      .update({ status: "finalized", model: "haiku-fallback", worker: "crawl-finalize" })
      .eq("id", job.id).in("status", ["pending", "processing", "error"]).select("id");
    if (!claimed || claimed.length === 0) continue;
    let verdict: Verdict | null = anthropicKey ? await haikuVerify(job, anthropicKey, supabase) : null;
    if (!verdict) verdict = { verdict: "can_kiem_tra", reason: "Local vắng mặt, Haiku fallback không phản hồi" };
    else stats.haikuFallback++;
    await supabase.from("llm_shadow_queue").update({ local_verdict: verdict }).eq("id", job.id);
    await applyVerdict(supabase, job, verdict, "haiku-fallback", stats);
    stats.finalized++;
  }

  // ===== 3) LÔ PHÂN LOẠI BULK: worker đã chấm xong =====
  const { data: doneBatches } = await supabase.from("llm_shadow_queue")
    .select("*").eq("task", "phan_loai_lo").eq("status", "done")
    .order("created_at", { ascending: true }).limit(20);
  for (const job of doneBatches ?? []) {
    const { data: claimed } = await supabase.from("llm_shadow_queue")
      .update({ status: "finalized" }).eq("id", job.id).eq("status", "done").select("id");
    if (!claimed || claimed.length === 0) continue;
    await applyBatchVerdict(supabase, job, normalizeBatchItems(job.local_verdict), "local", stats);
    stats.batchFinalized++;
  }

  // ===== 4) LÔ quá hạn/lỗi → Haiku chấm thay =====
  const { data: staleBatches } = await supabase.from("llm_shadow_queue")
    .select("*").eq("task", "phan_loai_lo").in("status", ["pending", "processing", "error"])
    .lt("created_at", staleCutoff)
    .order("created_at", { ascending: true }).limit(STALE_BATCH);
  for (const job of staleBatches ?? []) {
    const { data: claimed } = await supabase.from("llm_shadow_queue")
      .update({ status: "finalized", model: "haiku-fallback", worker: "crawl-finalize" })
      .eq("id", job.id).in("status", ["pending", "processing", "error"]).select("id");
    if (!claimed || claimed.length === 0) continue;
    const arr = anthropicKey ? await haikuClassifyBatch(job, anthropicKey, supabase) : null;
    if (arr === null) {
      // Haiku cũng lỗi → trả job về pending để lượt sau thử lại (KHÔNG mất lô).
      await supabase.from("llm_shadow_queue")
        .update({ status: "pending", model: null, worker: null }).eq("id", job.id);
      stats.batchRetryLater++;
      continue;
    }
    await supabase.from("llm_shadow_queue").update({ local_verdict: { items: arr } }).eq("id", job.id);
    await applyBatchVerdict(supabase, job, arr, "haiku-fallback", stats);
    stats.batchFinalized++;
    stats.batchHaikuFallback++;
  }

  return new Response(JSON.stringify({ ok: true, ...stats }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
