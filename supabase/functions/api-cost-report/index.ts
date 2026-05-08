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
): Promise<{ rows: AggRow[]; totalCost: number; totalCalls: number; totalIn: number; totalOut: number }> {
  // Bulk fetch + JS aggregate (đơn giản, đủ cho khối lượng dự kiến < vài nghìn rows/ngày).
  const { data, error } = await sb
    .from("llm_usage_log")
    .select("function_name, cost_usd, input_tokens, output_tokens")
    .gte("created_at", startIso)
    .lt("created_at", endIso);

  if (error) throw new Error(`aggregate query: ${error.message}`);

  const map = new Map<string, AggRow>();
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
    totalCost += cost;
    totalCalls += 1;
    totalIn += inT;
    totalOut += outT;
  }

  const rows = [...map.values()].sort((a, b) => b.cost_usd - a.cost_usd);
  return { rows, totalCost, totalCalls, totalIn, totalOut };
}

function escapeMd(s: string): string {
  return s.replace(/([_*`\[\]])/g, "\\$1");
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
  }

  await sendTelegram(tgToken, tgChatId, lines.join("\n"));
  return { ok: true, total_usd: agg.totalCost };
}

async function handleHourlyCheck(
  sb: ReturnType<typeof createClient>,
  tgToken: string,
  tgChatId: string,
): Promise<{ ok: boolean; total_usd: number; alerted: boolean }> {
  const end = new Date();
  const start = new Date(end.getTime() - 3600 * 1000);
  const agg = await aggregate(sb, start.toISOString(), end.toISOString());

  if (agg.totalCost <= HOURLY_THRESHOLD_USD) {
    return { ok: true, total_usd: agg.totalCost, alerted: false };
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
  lines.push(`_Window: ${start.toISOString()} → ${end.toISOString()}_`);

  await sendTelegram(tgToken, tgChatId, lines.join("\n"));
  return { ok: true, total_usd: agg.totalCost, alerted: true };
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
