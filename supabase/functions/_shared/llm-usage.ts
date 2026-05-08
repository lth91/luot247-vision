// Shared helper để log token usage sau mỗi call Anthropic.
// Insert vào public.llm_usage_log (xem migration 20260508030000_llm_usage_log.sql).
// Edge function api-cost-report aggregate bảng này gửi Telegram.

// Pricing USD per 1M tokens. Giá lấy từ anthropic.com/pricing tại thời điểm 2026-05.
// Cache creation = 1.25x input, cache read = 0.1x input.
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5-20251001": { input: 1.0, output: 5.0 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-sonnet-4-5": { input: 3.0, output: 15.0 },
  "claude-opus-4-7": { input: 15.0, output: 75.0 },
  "claude-opus-4-6": { input: 15.0, output: 75.0 },
};

const DEFAULT_PRICING = { input: 1.0, output: 5.0 }; // fallback = haiku

export interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export function calculateCostUsd(model: string, usage: AnthropicUsage): number {
  const price = PRICING[model] ?? DEFAULT_PRICING;
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const cacheCreate = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;

  return (
    (input * price.input) / 1_000_000 +
    (output * price.output) / 1_000_000 +
    (cacheCreate * price.input * 1.25) / 1_000_000 +
    (cacheRead * price.input * 0.1) / 1_000_000
  );
}

// Fire-and-forget log. Không throw — log fail không được block main pipeline.
// Caller pass supabase client (service-role) để tránh tạo connection mới mỗi call.
export async function logLlmUsage(
  supabase: { from: (t: string) => { insert: (row: unknown) => Promise<{ error: unknown }> } },
  params: {
    functionName: string;
    model: string;
    usage: AnthropicUsage;
  },
): Promise<void> {
  try {
    const cost = calculateCostUsd(params.model, params.usage);
    const { error } = await supabase.from("llm_usage_log").insert({
      function_name: params.functionName,
      model: params.model,
      input_tokens: params.usage.input_tokens ?? 0,
      output_tokens: params.usage.output_tokens ?? 0,
      cache_creation_input_tokens: params.usage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: params.usage.cache_read_input_tokens ?? 0,
      cost_usd: cost,
    });
    if (error) {
      console.warn("[llm-usage] insert failed:", JSON.stringify(error));
    }
  } catch (err) {
    console.warn("[llm-usage] log error:", err instanceof Error ? err.message : String(err));
  }
}
