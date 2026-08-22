// Báo cáo cost API Anthropic qua Telegram.
// 3 modes (qua query param ?mode=...):
//   - daily        → tổng hôm qua (00:00→24:00 GMT+7) + breakdown + so 7-day avg
//   - 6h-report    → tổng 6h vừa qua + breakdown per function (luôn gửi, kể cả $0)
//   - hourly-check → 1h vừa qua. Chỉ alert nếu cost > $HOURLY_THRESHOLD_USD.
//
// Test mode: ?test=1 gửi message ping kiểm tra Telegram + secret còn sống.
//
// Bảng nguồn: public.llm_usage_log (cột cost_usd đã pre-calc).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendTelegram } from "../_shared/telegram.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HOURLY_THRESHOLD_USD = 1.0; // alert ngay nếu 1h chi > $1

// CHÓ CANH DEEPSEEK (22/08): sự cố 22/08 — tài khoản DeepSeek hết số dư, mọi
// cú gọi ném 402, fail-open đưa toàn bộ tải về Haiku. Tin vẫn chạy đều, không
// một tiếng động nào, cost lặng lẽ về giá cũ (gấp ~10). Chỉ lộ nhờ một đợt
// nhập 2.000 tin đẩy cost vượt ngưỡng giờ — ngày thường sẽ không ai biết.
// Canh trực tiếp triệu chứng gốc: công tắc bật mà 1h không có dòng DeepSeek nào.
const DEEPSEEK_SWITCHES = ["viet_deepseek", "giam_khao_deepseek", "bulk_deepseek", "le_deepseek"];
const DEEPSEEK_MODEL = "deepseek-v4-flash";
const SILENT_MIN_CALLS = 10; // dưới mức này coi như giờ vắng, không kết luận

interface ModelRow {
  model: string;
  cost_usd: number;
  call_count: number;
}

interface AggRow {
  function_name: string;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  call_count: number;
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(4)}`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// Trả về [startIso, endIso] cho khoảng "ngày hôm qua GMT+7".
function yesterdayWindowVn(): { start: string; end: string; label: string } {
  // Tính ngày local +07: lấy now UTC + 7h, slice(0,10) = ngày hôm nay VN
  const now = new Date();
  const vnOffsetMs = 7 * 3600 * 1000;
  const todayVn = new Date(now.getTime() + vnOffsetMs);
  // Hôm qua VN: 00:00 hôm qua VN = (today_vn at 00:00 UTC) - 17h (vì 00:00 VN = -7h UTC, hôm qua = -24h)
  const yLabel = new Date(todayVn.getTime() - 86_400_000).toISOString().slice(0, 10); // YYYY-MM-DD
  // Convert lại: 00:00 ngày hôm qua VN = UTC (yyyy-mm-dd)T00:00 - 7h = (yyyy-mm-dd-1)T17:00
  const startUtc = new Date(`${yLabel}T00:00:00+07:00`).toISOString();
  const endUtc = new Date(new Date(`${yLabel}T00:00:00+07:00`).getTime() + 86_400_000).toISOString();
  return { start: startUtc, end: endUtc, label: yLabel };
}

async function aggregate(
  sb: ReturnType<typeof createClient>,
  startIso: string,
  endIso: string,
): Promise<{ rows: AggRow[]; byModel: ModelRow[]; totalCost: number; totalCalls: number; totalIn: number; totalOut: number }> {
  // Fetch PHÂN TRANG + JS aggregate. Bug 23/07: PostgREST cắt 1000 dòng/lần —
  // ngày crawl gọi ~1.300-1.500 cú nên báo cáo daily đếm THIẾU (vd 22/07 báo
  // $5.35 trong khi 17h đã $5.91). Phải .range() gom đủ trang.
  const PAGE = 1000;
  const data: { function_name: string; model: string; cost_usd: number; input_tokens: number; output_tokens: number }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data: page, error } = await sb
      .from("llm_usage_log")
      .select("function_name, model, cost_usd, input_tokens, output_tokens")
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`aggregate query: ${error.message}`);
    data.push(...(page ?? []));
    if (!page || page.length < PAGE) break;
  }

  const map = new Map<string, AggRow>();
  const mmap = new Map<string, ModelRow>();
  let totalCost = 0;
  let totalCalls = 0;
  let totalIn = 0;
  let totalOut = 0;

  for (const r of data ?? []) {
    const cost = Number(r.cost_usd) || 0;
    const inT = Number(r.input_tokens) || 0;
    const outT = Number(r.output_tokens) || 0;
    const fn = String(r.function_name);
    let row = map.get(fn);
    if (!row) {
      row = { function_name: fn, cost_usd: 0, input_tokens: 0, output_tokens: 0, call_count: 0 };
      map.set(fn, row);
    }
    row.cost_usd += cost;
    row.input_tokens += inT;
    row.output_tokens += outT;
    row.call_count += 1;
    const md = String(r.model ?? "?");
    const mrow = mmap.get(md) ?? { model: md, cost_usd: 0, call_count: 0 };
    mrow.cost_usd += cost;
    mrow.call_count += 1;
    mmap.set(md, mrow);
    totalCost += cost;
    totalCalls += 1;
    totalIn += inT;
    totalOut += outT;
  }

  const rows = [...map.values()].sort((a, b) => b.cost_usd - a.cost_usd);
  const byModel = [...mmap.values()].sort((a, b) => b.cost_usd - a.cost_usd);
  return { rows, byModel, totalCost, totalCalls, totalIn, totalOut };
}

function escapeMd(s: string): string {
  return s.replace(/([_*`\[\]])/g, "\\$1");
}

// Công tắc DeepSeek đang bật (đọc hybrid_config). Lỗi đọc → trả rỗng, chó canh
// nằm im chứ không sủa oan.
async function deepseekSwitchesOn(sb: ReturnType<typeof createClient>): Promise<string[]> {
  try {
    const { data, error } = await sb
      .from("hybrid_config").select("key, enabled").in("key", DEEPSEEK_SWITCHES);
    if (error) return [];
    return ((data ?? []) as { key: string; enabled: boolean }[])
      .filter((c) => c.enabled === true).map((c) => c.key);
  } catch {
    return [];
  }
}

function modelLines(byModel: ModelRow[]): string[] {
  return byModel.map((m) => `• \`${escapeMd(m.model)}\` — ${fmtUsd(m.cost_usd)} (${m.call_count} calls)`);
}

async function handleDaily(
  sb: ReturnType<typeof createClient>,
  tgToken: string,
  tgChatId: string,
): Promise<{ ok: boolean; total_usd: number; label: string }> {
  const { start, end, label } = yesterdayWindowVn();
  const today = await aggregate(sb, start, end);

  // 7-day avg (không bao gồm hôm qua) → so sánh
  const sevenStart = new Date(new Date(start).getTime() - 7 * 86_400_000).toISOString();
  const sevenAgg = await aggregate(sb, sevenStart, start);
  const sevenAvg = sevenAgg.totalCost / 7;

  const lines: string[] = [];
  lines.push(`💰 *Báo cáo API cost — ${label}*`);
  lines.push("");
  lines.push(`Tổng: *${fmtUsd(today.totalCost)}* (${today.totalCalls} calls)`);
  lines.push(`Tokens: in ${fmtTokens(today.totalIn)} / out ${fmtTokens(today.totalOut)}`);
  if (sevenAvg > 0) {
    const delta = today.totalCost - sevenAvg;
    const pct = (delta / sevenAvg) * 100;
    const arrow = delta >= 0 ? "📈" : "📉";
    lines.push(`So 7-day avg (${fmtUsd(sevenAvg)}): ${arrow} ${delta >= 0 ? "+" : ""}${pct.toFixed(0)}%`);
  }
  lines.push("");

  if (today.rows.length === 0) {
    lines.push("_Không có call nào hôm qua._");
  } else {
    lines.push("*Chi tiết theo function:*");
    for (const r of today.rows) {
      lines.push(
        `• \`${escapeMd(r.function_name)}\` — ${fmtUsd(r.cost_usd)} (${r.call_count} calls, ${fmtTokens(r.input_tokens)}↗ / ${fmtTokens(r.output_tokens)}↘)`,
      );
    }
    lines.push("");
    lines.push("*Theo model:*");
    lines.push(...modelLines(today.byModel));
  }

  await sendTelegram(tgToken, tgChatId, lines.join("\n"));
  return { ok: true, total_usd: today.totalCost, label };
}

async function handle6hReport(
  sb: ReturnType<typeof createClient>,
  tgToken: string,
  tgChatId: string,
): Promise<{ ok: boolean; total_usd: number }> {
  const end = new Date();
  const start = new Date(end.getTime() - 6 * 3600 * 1000);
  const agg = await aggregate(sb, start.toISOString(), end.toISOString());

  // Format giờ VN ngắn gọn cho header
  const startVn = new Date(start.getTime() + 7 * 3600 * 1000).toISOString().slice(11, 16);
  const endVn = new Date(end.getTime() + 7 * 3600 * 1000).toISOString().slice(11, 16);

  const lines: string[] = [];
  lines.push(`📊 *Báo cáo API cost 6h — ${startVn}→${endVn} VN*`);
  lines.push("");
  lines.push(`Tổng: *${fmtUsd(agg.totalCost)}* (${agg.totalCalls} calls)`);
  lines.push(`Tokens: in ${fmtTokens(agg.totalIn)} / out ${fmtTokens(agg.totalOut)}`);
  lines.push("");
  if (agg.rows.length === 0) {
    lines.push("_Không có call LLM nào trong 6h qua._");
  } else {
    lines.push("*Theo function:*");
    for (const r of agg.rows) {
      lines.push(
        `• \`${escapeMd(r.function_name)}\` — ${fmtUsd(r.cost_usd)} (${r.call_count} calls, ${fmtTokens(r.input_tokens)}↗ / ${fmtTokens(r.output_tokens)}↘)`,
      );
    }
    lines.push("");
    lines.push("*Theo model:*");
    lines.push(...modelLines(agg.byModel));
  }

  await sendTelegram(tgToken, tgChatId, lines.join("\n"));
  return { ok: true, total_usd: agg.totalCost };
}

async function handleHourlyCheck(
  sb: ReturnType<typeof createClient>,
  tgToken: string,
  tgChatId: string,
): Promise<{ ok: boolean; total_usd: number; alerted: boolean; deepseek_silent: boolean }> {
  const end = new Date();
  const start = new Date(end.getTime() - 3600 * 1000);
  const agg = await aggregate(sb, start.toISOString(), end.toISOString());

  // CHÓ CANH: công tắc DeepSeek bật mà 1h qua không có cú DeepSeek nào trong
  // khi máy vẫn chạy → đang đốt tiền giá Haiku trong im lặng. Báo riêng, không
  // phụ thuộc ngưỡng cost (sự cố 22/08 nằm dưới ngưỡng suốt nhiều nhịp).
  const dsCalls = agg.byModel.find((m) => m.model === DEEPSEEK_MODEL)?.call_count ?? 0;
  let silentAlert = false;
  if (dsCalls === 0 && agg.totalCalls >= SILENT_MIN_CALLS) {
    const on = await deepseekSwitchesOn(sb);
    if (on.length > 0) {
      silentAlert = true;
      const l: string[] = [];
      l.push("⚠️ *DeepSeek im tiếng — đang chạy Haiku giá gấp ~10*");
      l.push("");
      l.push(`Công tắc đang BẬT: ${on.map((k) => `\`${escapeMd(k)}\``).join(", ")}`);
      l.push(`Nhưng 1h qua: *0* cú \`${DEEPSEEK_MODEL}\` / ${agg.totalCalls} calls, chi ${fmtUsd(agg.totalCost)}.`);
      l.push("");
      l.push("Fail-open đã đưa toàn bộ tải về Haiku. Tin vẫn chạy, chỉ có tiền chảy.");
      l.push("Kiểm tra theo thứ tự: *số dư DeepSeek* (402 hết tiền) → *DEEPSEEK\\_API\\_KEY* còn không (401/thiếu key) → log edge function lọc chữ `deepseek`.");
      await sendTelegram(tgToken, tgChatId, l.join("\n"));
    }
  }

  if (agg.totalCost <= HOURLY_THRESHOLD_USD) {
    return { ok: true, total_usd: agg.totalCost, alerted: silentAlert, deepseek_silent: silentAlert };
  }

  const lines: string[] = [];
  lines.push(`🚨 *Cảnh báo API cost vượt ngưỡng*`);
  lines.push("");
  lines.push(`1h vừa qua: *${fmtUsd(agg.totalCost)}* (ngưỡng ${fmtUsd(HOURLY_THRESHOLD_USD)})`);
  lines.push(`${agg.totalCalls} calls, in ${fmtTokens(agg.totalIn)} / out ${fmtTokens(agg.totalOut)}`);
  lines.push("");
  lines.push("*Top function:*");
  for (const r of agg.rows.slice(0, 5)) {
    lines.push(`• \`${escapeMd(r.function_name)}\` — ${fmtUsd(r.cost_usd)} (${r.call_count} calls)`);
  }
  lines.push("");
  // Model nào gánh — đọc là biết ngay đắt vì đang chạy Haiku hay vì tải lớn.
  lines.push("*Theo model:*");
  lines.push(...modelLines(agg.byModel));
  lines.push("");
  lines.push(`_Window: ${start.toISOString()} → ${end.toISOString()}_`);

  await sendTelegram(tgToken, tgChatId, lines.join("\n"));
  return { ok: true, total_usd: agg.totalCost, alerted: true, deepseek_silent: silentAlert };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const tgToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const tgChatId = Deno.env.get("TELEGRAM_CHAT_ID");

  if (!tgToken || !tgChatId) {
    return new Response(JSON.stringify({ error: "Telegram secrets missing" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") ?? "daily";

  // Test mode: gửi ping kiểm tra Telegram alive
  if (url.searchParams.get("test") === "1") {
    try {
      await sendTelegram(
        tgToken,
        tgChatId,
        `🧪 *Test api-cost-report*\n\nNếu anh thấy tin nhắn này, hệ thống báo cost API qua Telegram đang OK.\n\n_${new Date().toISOString()}_`,
      );
      return new Response(JSON.stringify({ ok: true, test_sent: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const sb = createClient(supabaseUrl, serviceKey);

  try {
    if (mode === "hourly-check") {
      const result = await handleHourlyCheck(sb, tgToken, tgChatId);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (mode === "6h-report") {
      const result = await handle6hReport(sb, tgToken, tgChatId);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (mode === "daily") {
      const result = await handleDaily(sb, tgToken, tgChatId);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: `unknown mode: ${mode}` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
