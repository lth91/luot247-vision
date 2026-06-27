// Edge function: nhận tin do USER gửi → kiểm duyệt tự động → auto-publish.
// Luồng: verify JWT → validate độ dài (từ) → dedup URL + title → LLM (giọng AI
// + plausibility + phân loại 5 mục) → INSERT news (is_approved=true) + log.
// Deploy với --no-verify-jwt (như mọi function repo) → verify JWT THỦ CÔNG.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { logLlmUsage } from "../_shared/llm-usage.ts";
import { canonicalizeUrl, sha256Hex } from "../_shared/url.ts";
import { CATEGORY_RULES, isValidCategory, SUBMISSION_CATEGORY_SLUGS } from "../_shared/news-categories.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

// Ngưỡng độ dài (đếm theo TỪ) — chốt với user.
const TITLE_MIN = 10, TITLE_MAX = 18;
const CONTENT_MIN = 110, CONTENT_MAX = 140;

// Chống spam + tốn token LLM: tối đa N submission / cửa sổ thời gian / user.
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MIN = 60;

function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, reason: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

  // Service-role client: ghi DB vượt RLS đã siết ở migration.
  const supabase = createClient(supabaseUrl, serviceKey);

  // --- 1) Verify JWT thủ công ---
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return json({ ok: false, reason: "Bạn cần đăng nhập để gửi tin." }, 401);

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (userErr || !user) return json({ ok: false, reason: "Phiên đăng nhập không hợp lệ." }, 401);

  // Ghi log + (best-effort) trả về. status thuộc CHECK constraint của submission_log.
  const log = async (status: string, opts: { news_id?: string | null; reject_reason?: string; ai_score?: unknown } = {}) => {
    await supabase.from("submission_log").insert({
      user_id: user.id,
      news_id: opts.news_id ?? null,
      status,
      reject_reason: opts.reject_reason ?? null,
      ai_score: opts.ai_score ?? null,
    });
  };

  try {
    // --- 2) Parse body ---
    const body = await req.json().catch(() => null);
    if (!body) return json({ ok: false, reason: "Dữ liệu gửi không hợp lệ." }, 400);
    const title = String(body.title ?? "").trim();
    const content = String(body.content ?? "").trim();
    const rawUrl = body.url ? String(body.url).trim() : "";
    const declaredCategory = String(body.declared_category ?? "").trim();

    if (!title || !content) {
      await log("rejected_length", { reject_reason: "Thiếu tiêu đề hoặc nội dung." });
      return json({ ok: false, reason: "Vui lòng nhập đủ tiêu đề và nội dung." });
    }

    // --- Rate limit ---
    const sinceIso = new Date(Date.now() - RATE_LIMIT_WINDOW_MIN * 60_000).toISOString();
    const { count: recentCount } = await supabase
      .from("submission_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", sinceIso);
    if ((recentCount ?? 0) >= RATE_LIMIT_MAX) {
      return json({ ok: false, reason: `Bạn gửi quá nhiều tin trong ${RATE_LIMIT_WINDOW_MIN} phút. Vui lòng thử lại sau.` }, 429);
    }

    // --- 3) Validate độ dài (TỪ) ---
    const titleWords = countWords(title);
    const contentWords = countWords(content);
    if (titleWords < TITLE_MIN || titleWords > TITLE_MAX) {
      const reason = `Tiêu đề cần ${TITLE_MIN}–${TITLE_MAX} từ (hiện ${titleWords}).`;
      await log("rejected_length", { reject_reason: reason });
      return json({ ok: false, reason });
    }
    if (contentWords < CONTENT_MIN || contentWords > CONTENT_MAX) {
      const reason = `Nội dung cần ${CONTENT_MIN}–${CONTENT_MAX} từ (hiện ${contentWords}).`;
      await log("rejected_length", { reject_reason: reason });
      return json({ ok: false, reason });
    }

    // --- 4) Dedup URL ---
    let urlHash: string | null = null;
    if (rawUrl) {
      const canon = canonicalizeUrl(rawUrl);
      if (canon) {
        urlHash = await sha256Hex(canon);
        const { data: dup } = await supabase.from("news").select("id").eq("url_hash", urlHash).limit(1).maybeSingle();
        if (dup) {
          const reason = "Tin từ URL này đã có trên hệ thống.";
          await log("rejected_duplicate", { reject_reason: reason });
          return json({ ok: false, reason });
        }
      }
    }

    // --- 5) Dedup title (trigram qua RPC) ---
    const { data: similarId } = await supabase.rpc("find_similar_news_title", { _title: title, _threshold: 0.7 });
    if (similarId) {
      const reason = "Đã có tin với tiêu đề rất giống. Tránh đăng trùng.";
      await log("rejected_similar", { reject_reason: reason, news_id: similarId as string });
      return json({ ok: false, reason });
    }

    // --- 6) LLM: giọng AI + plausibility + phân loại ---
    if (!anthropicKey) return json({ ok: false, reason: "Hệ thống tạm thời chưa sẵn sàng (thiếu cấu hình AI)." }, 500);

    const systemPrompt = `Bạn là biên tập viên kiểm duyệt tin tức tiếng Việt. Phân tích bản tin người dùng gửi và trả về DUY NHẤT một object JSON (không markdown, không giải thích thêm) theo schema:
{
  "is_ai_generated": boolean,        // true nếu văn phong mang dấu hiệu do AI tạo (sáo rỗng, "trong bối cảnh", "đáng chú ý là", "có thể nói rằng", liệt kê máy móc, trung lập quá mức)
  "ai_confidence": number,           // 0..1 độ chắc chắn về is_ai_generated
  "is_plausible": boolean,           // tin có hợp lý, nhất quán nội bộ, không phi lý/bịa đặt rõ ràng
  "plausibility_reason": string,     // ≤15 từ, lý do
  "category": string,                // một trong: ${SUBMISSION_CATEGORY_SLUGS.join(", ")}
  "category_confidence": number      // 0..1
}

QUY TẮC PHÂN LOẠI:
${CATEGORY_RULES}`;

    const userMsg = `Tiêu đề: ${title}\n\nNội dung:\n${content}${rawUrl ? `\n\nNguồn: ${rawUrl}` : ""}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 400,
        temperature: 0.2,
        system: [{ type: "text", text: systemPrompt }],
        messages: [{ role: "user", content: userMsg }],
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error("Anthropic error", res.status, txt.slice(0, 200));
      await log("error", { reject_reason: `LLM ${res.status}` });
      return json({ ok: false, reason: "Lỗi kiểm duyệt tự động, vui lòng thử lại sau." }, 502);
    }

    const data = await res.json();
    if (data?.usage) {
      await logLlmUsage(supabase, { functionName: "submit-news", model: ANTHROPIC_MODEL, usage: data.usage });
    }

    const raw: string = (data?.content?.[0]?.text ?? "").trim();
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    let parsed: Record<string, unknown> | null = null;
    if (match) { try { parsed = JSON.parse(match[0]); } catch { parsed = null; } }
    if (!parsed) {
      console.error("LLM parse fail:", raw.slice(0, 200));
      await log("error", { reject_reason: "LLM trả về không parse được." });
      return json({ ok: false, reason: "Lỗi kiểm duyệt tự động, vui lòng thử lại sau." }, 502);
    }

    const isAi = parsed.is_ai_generated === true;
    const aiConf = typeof parsed.ai_confidence === "number" ? parsed.ai_confidence : 0;
    const isPlausible = parsed.is_plausible !== false; // mặc định coi là hợp lý nếu thiếu

    // --- 6a) Reject giọng AI ---
    if (isAi && aiConf >= 0.8) {
      const reason = "Nội dung có dấu hiệu do AI tạo. Vui lòng viết lại bằng văn phong tự nhiên.";
      await log("rejected_ai", { reject_reason: reason, ai_score: parsed });
      return json({ ok: false, reason });
    }
    // --- 6b) Reject phi lý ---
    if (!isPlausible) {
      const reason = "Nội dung có dấu hiệu không hợp lý/khó xác minh.";
      await log("rejected_implausible", { reject_reason: reason, ai_score: parsed });
      return json({ ok: false, reason });
    }

    // --- 6c) Chọn category ---
    const llmCat = typeof parsed.category === "string" ? parsed.category : "";
    const catConf = typeof parsed.category_confidence === "number" ? parsed.category_confidence : 0;
    let category: string;
    if (isValidCategory(llmCat)) category = llmCat;
    else if (isValidCategory(declaredCategory)) category = declaredCategory;
    else category = "xa-hoi-van-hoa"; // fallback an toàn

    // --- 7) INSERT news (auto-publish) ---
    const { data: inserted, error: insErr } = await supabase
      .from("news")
      .insert({
        title,
        description: content,
        category,
        url: rawUrl || null,
        is_approved: true,
        submitted_by: user.id,
        url_hash: urlHash,
        ai_classification: { ...parsed, category_confidence_low: catConf < 0.5 },
      })
      .select("id")
      .single();

    if (insErr || !inserted) {
      // Có thể vướng unique url_hash do race → coi như trùng.
      console.error("Insert news error:", insErr);
      await log("rejected_duplicate", { reject_reason: "Tin trùng hoặc lỗi lưu." });
      return json({ ok: false, reason: "Không lưu được tin (có thể bị trùng). Thử lại sau." });
    }

    // --- 8) Log accepted ---
    await log("accepted", { news_id: inserted.id, ai_score: parsed });

    return json({
      ok: true,
      news_id: inserted.id,
      category,
      points_awarded: 10,
      message: "Tin đã được đăng. +10 điểm!",
    });
  } catch (err) {
    console.error("submit-news error:", err);
    try { await log("error", { reject_reason: err instanceof Error ? err.message.slice(0, 200) : "unknown" }); } catch { /* ignore */ }
    return json({ ok: false, reason: "Có lỗi xảy ra, vui lòng thử lại." }, 500);
  }
});
