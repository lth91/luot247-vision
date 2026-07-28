// Chế độ bóng local LLM (28/07): ghi INPUT + phán quyết Haiku vào
// llm_shadow_queue để worker trên Mac chấm song song bằng model local.
// BEST-EFFORT tuyệt đối — bảng chưa tạo / lỗi mạng thì bỏ qua, không được
// chặn pipeline chính. Local chưa có quyền quyết gì ở giai đoạn này.

// deno-lint-ignore no-explicit-any
type AnySupabase = { from: (t: string) => any };

export type ShadowTask = "phan_loai" | "kiem_som" | "giam_khao";

export async function logShadow(
  supabase: AnySupabase,
  task: ShadowTask,
  payload: Record<string, unknown>,
  haikuVerdict: Record<string, unknown>,
): Promise<void> {
  try {
    const { error } = await supabase
      .from("llm_shadow_queue")
      .insert({ task, payload, haiku_verdict: haikuVerdict });
    if (error) console.warn("[shadow] insert fail:", JSON.stringify(error).slice(0, 200));
  } catch (e) {
    console.warn("[shadow] error:", e instanceof Error ? e.message : String(e));
  }
}

export async function logShadowMany(
  supabase: AnySupabase,
  rows: Array<{ task: ShadowTask; payload: Record<string, unknown>; haiku_verdict: Record<string, unknown> }>,
): Promise<void> {
  if (rows.length === 0) return;
  try {
    const { error } = await supabase.from("llm_shadow_queue").insert(rows);
    if (error) console.warn("[shadow] bulk insert fail:", JSON.stringify(error).slice(0, 200));
  } catch (e) {
    console.warn("[shadow] error:", e instanceof Error ? e.message : String(e));
  }
}
