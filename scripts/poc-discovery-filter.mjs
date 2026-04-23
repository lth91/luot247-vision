#!/usr/bin/env node
// POC Bước 2: Discovery + LLM filter relevance.
// Fetch Google News RSS → resolve redirect URL gốc → Claude Haiku 4.5 classify relevance.
// Không insert DB. Chỉ in ra kết quả để đánh giá.
//
// Chạy:
//   export ANTHROPIC_API_KEY="sk-ant-..."
//   node scripts/poc-discovery-filter.mjs
//
// Flags:
//   LIMIT=30     # giới hạn số bài filter (default 50)
//   VERBOSE=1    # in lý do reject

const QUERIES = [
  "điện lực Việt Nam",
  "EVN",
  "năng lượng tái tạo Việt Nam",
  "điện gió Việt Nam",
  "điện mặt trời Việt Nam",
  "nhiệt điện Việt Nam",
  "thủy điện Việt Nam",
  "Bộ Công Thương điện",
  "giá điện",
  "cung ứng điện",
  "lưới điện quốc gia",
  "pin lưu trữ BESS",
];

const UA = "Mozilla/5.0 (compatible; Luot247Bot/0.1)";
const WINDOW_MS = 24 * 60 * 60 * 1000;
const MODEL = "claude-haiku-4-5-20251001";
const LIMIT = parseInt(process.env.LIMIT ?? "50", 10);
const VERBOSE = !!process.env.VERBOSE;

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error("Thiếu ANTHROPIC_API_KEY trong env.");
  process.exit(1);
}

// ---------- Discovery ----------
function parseRssItems(xml) {
  const items = [];
  const matches = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const it of matches) {
    const title = (it.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "")
      .replace(/<!\[CDATA\[|\]\]>/g, "").trim();
    const link = (it.match(/<link>([\s\S]*?)<\/link>/)?.[1] || "").trim();
    const pubDate = (it.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || "").trim();
    const source = (it.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] || "")
      .replace(/<!\[CDATA\[|\]\]>/g, "").trim();
    const description = (it.match(/<description>([\s\S]*?)<\/description>/)?.[1] || "")
      .replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, "").trim();
    if (link) items.push({ title, link, pubDate, source, description });
  }
  return items;
}

async function fetchQuery(q) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=vi&gl=VN&ceid=VN:vi`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${q}: HTTP ${res.status}`);
  return parseRssItems(await res.text());
}

async function resolveGoogleUrl(gUrl) {
  // Fetch HEAD → follow redirect → lấy URL cuối.
  try {
    const res = await fetch(gUrl, {
      method: "GET",
      headers: { "User-Agent": UA },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    return res.url;
  } catch {
    return gUrl;
  }
}

async function pool(items, concurrency, worker) {
  const out = new Array(items.length);
  let idx = 0;
  async function runner() {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      out[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, runner));
  return out;
}

// ---------- Filter ----------
const SYSTEM_PROMPT = `Bạn phân loại tin tức. Nhiệm vụ: xác định bài báo có LIÊN QUAN ngành điện/năng lượng Việt Nam hay không.

LIÊN QUAN: tin về EVN, sản xuất/truyền tải/phân phối điện, điện gió/mặt trời/hạt nhân/thủy điện/nhiệt điện, giá điện, cung ứng điện, lưới điện, pin lưu trữ (BESS), chính sách năng lượng VN, xe điện VN, tiết kiệm điện.

KHÔNG LIÊN QUAN: xuất khẩu hàng hóa chung, buôn lậu, xăng dầu (trừ khi có gắn với điện), kinh tế vĩ mô không liên quan điện, showbiz, thể thao, tin quốc tế (trừ ảnh hưởng VN), bài quảng cáo sản phẩm điện gia dụng.

ĐỊNH DẠNG TRẢ VỀ (JSON thuần, không markdown):
{"relevant": true|false, "confidence": 0.0-1.0, "reason": "lý do ngắn ≤15 từ"}`;

async function classifyBatch(candidates) {
  // Batch 10 candidates/call để tiết kiệm — mỗi item có id, LLM trả mảng.
  const batchSize = 10;
  const results = new Array(candidates.length);

  for (let start = 0; start < candidates.length; start += batchSize) {
    const batch = candidates.slice(start, start + batchSize);
    const userMsg = `Phân loại ${batch.length} bài dưới đây. Trả về MẢNG JSON ${batch.length} phần tử, theo đúng thứ tự, mỗi phần tử là {"relevant": bool, "confidence": 0-1, "reason": "..."}.

${batch.map((c, i) => `[${i}] TITLE: ${c.title}\nSOURCE: ${c.source}\nDESC: ${(c.description || "").slice(0, 200)}`).join("\n\n")}`;

    const t0 = Date.now();
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMsg }],
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Claude HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }
    const data = await res.json();
    const usage = data.usage ?? {};
    const text = data.content?.[0]?.text ?? "[]";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    let parsed;
    try {
      parsed = JSON.parse(jsonMatch?.[0] ?? text);
    } catch {
      console.error(`Batch ${start / batchSize}: parse fail, raw:`, text.slice(0, 300));
      parsed = batch.map(() => ({ relevant: null, confidence: 0, reason: "parse-fail" }));
    }

    for (let i = 0; i < batch.length; i++) {
      results[start + i] = {
        ...parsed[i],
        _usage: i === 0 ? usage : null,
        _latency: i === 0 ? Date.now() - t0 : null,
      };
    }
  }
  return results;
}

// ---------- Main ----------
async function main() {
  console.log("Bước 1/3: Discovery Google News...");
  const tDisc = Date.now();
  const all = new Map();
  for (const q of QUERIES) {
    try {
      const items = await fetchQuery(q);
      const now = Date.now();
      for (const it of items) {
        const pubMs = it.pubDate ? Date.parse(it.pubDate) : NaN;
        if (!isNaN(pubMs) && now - pubMs > WINDOW_MS) continue;
        if (!all.has(it.link)) all.set(it.link, it);
      }
    } catch (e) {
      console.error(`  ✗ ${q}: ${e.message}`);
    }
  }
  const candidates = Array.from(all.values())
    .sort((a, b) => (Date.parse(b.pubDate) || 0) - (Date.parse(a.pubDate) || 0))
    .slice(0, LIMIT);
  console.log(`  ${candidates.length} ứng viên (≤24h, top ${LIMIT}), ${((Date.now() - tDisc) / 1000).toFixed(1)}s\n`);

  console.log("Bước 2/3: Resolve URL gốc (follow redirect)...");
  const tRes = Date.now();
  const resolved = await pool(candidates, 10, async (c) => {
    const url = await resolveGoogleUrl(c.link);
    return { ...c, resolvedUrl: url };
  });
  console.log(`  Done ${((Date.now() - tRes) / 1000).toFixed(1)}s\n`);

  console.log(`Bước 3/3: LLM filter (Claude Haiku 4.5)...`);
  const tFil = Date.now();
  const classified = await classifyBatch(resolved);
  console.log(`  Done ${((Date.now() - tFil) / 1000).toFixed(1)}s\n`);

  // Tính cost
  let totalInput = 0, totalOutput = 0;
  for (const c of classified) {
    if (c._usage) {
      totalInput += c._usage.input_tokens ?? 0;
      totalOutput += c._usage.output_tokens ?? 0;
    }
  }
  const cost = (totalInput * 1 / 1_000_000) + (totalOutput * 5 / 1_000_000);

  // Kết quả
  const pass = [];
  const reject = [];
  for (let i = 0; i < classified.length; i++) {
    const c = { ...resolved[i], ...classified[i] };
    if (c.relevant === true) pass.push(c);
    else reject.push(c);
  }

  console.log("=".repeat(80));
  console.log(`KẾT QUẢ — ${classified.length} bài đã classify`);
  console.log("=".repeat(80));
  console.log(`✓ Pass:   ${pass.length} (${(pass.length / classified.length * 100).toFixed(0)}%)`);
  console.log(`✗ Reject: ${reject.length} (${(reject.length / classified.length * 100).toFixed(0)}%)`);
  console.log(`Tokens: input=${totalInput}, output=${totalOutput}`);
  console.log(`Cost ước tính: $${cost.toFixed(4)} (= ~$${(cost * 24).toFixed(3)}/ngày nếu chạy hourly)`);

  console.log("\n## BÀI PASS (20 bài đầu):");
  for (const c of pass.slice(0, 20)) {
    const dt = c.pubDate ? new Date(c.pubDate).toISOString().slice(5, 16).replace("T", " ") : "?";
    const host = (() => { try { return new URL(c.resolvedUrl).host; } catch { return "?"; } })();
    console.log(`\n  [${dt}] ${host} (conf ${c.confidence ?? "?"})`);
    console.log(`  ${c.title}`);
    console.log(`  ${c.resolvedUrl?.slice(0, 100)}${(c.resolvedUrl?.length ?? 0) > 100 ? "..." : ""}`);
  }

  console.log("\n## BÀI REJECT (sample 15):");
  for (const c of reject.slice(0, 15)) {
    console.log(`  ✗ ${c.title?.slice(0, 75)} — ${c.reason}`);
  }

  if (VERBOSE) {
    console.log("\n## REJECT đầy đủ:");
    for (const c of reject) console.log(`  ✗ ${c.title} — ${c.reason}`);
  }

  // Thống kê domain của bài pass
  const byDomain = new Map();
  for (const c of pass) {
    try {
      const h = new URL(c.resolvedUrl).host.replace(/^www\./, "");
      byDomain.set(h, (byDomain.get(h) || 0) + 1);
    } catch { /* ignore */ }
  }
  console.log("\n## Domain của bài pass:");
  for (const [d, n] of Array.from(byDomain.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}  ${d}`);
  }

  console.log("\n" + "=".repeat(80));
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
