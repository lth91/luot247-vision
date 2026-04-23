#!/usr/bin/env node
// POC v2: Discovery từ RSS báo VN trực tiếp (URL gốc có sẵn).
// Flow: Fetch 10 RSS feeds → keyword pre-filter → Claude Haiku classify → report.
//
// Chạy:
//   export ANTHROPIC_API_KEY="sk-ant-..."
//   node scripts/poc-discovery-rss.mjs
//
// Flags:
//   LIMIT=50     # max số bài qua LLM (default 80)
//   NO_LLM=1     # chỉ chạy discovery + keyword filter, không gọi Claude

const FEEDS = [
  { name: "VnExpress - Kinh doanh",   url: "https://vnexpress.net/rss/kinh-doanh.rss" },
  { name: "VnExpress - Tin mới",      url: "https://vnexpress.net/rss/tin-moi-nhat.rss" },
  { name: "VnExpress - Khoa học",     url: "https://vnexpress.net/rss/khoa-hoc.rss" },
  { name: "Tuổi Trẻ - Kinh doanh",    url: "https://tuoitre.vn/rss/kinh-doanh.rss" },
  { name: "Tuổi Trẻ - Thời sự",       url: "https://tuoitre.vn/rss/thoi-su.rss" },
  { name: "Thanh Niên - Kinh tế",     url: "https://thanhnien.vn/rss/kinh-te.rss" },
  { name: "CafeF - Doanh nghiệp",     url: "https://cafef.vn/doanh-nghiep.rss" },
  { name: "CafeF - Chứng khoán",      url: "https://cafef.vn/thi-truong-chung-khoan.rss" },
  { name: "Dân Trí - Kinh doanh",     url: "https://dantri.com.vn/rss/kinh-doanh.rss" },
  { name: "Dân Trí - Sự kiện",        url: "https://dantri.com.vn/rss/su-kien.rss" },
  { name: "VnEconomy - Kinh tế",      url: "https://vneconomy.vn/kinh-te.rss" },
  { name: "VnEconomy - Tài chính",    url: "https://vneconomy.vn/tai-chinh.rss" },
  { name: "VnEconomy - Đầu tư",       url: "https://vneconomy.vn/dau-tu.rss" },
  { name: "VOV - Kinh tế",            url: "https://vov.vn/rss/kinh-te.rss" },
  { name: "VTC News - Kinh tế",       url: "https://vtcnews.vn/rss/kinh-te.rss" },
  { name: "Nhân Dân - Kinh tế",       url: "https://nhandan.vn/rss/kinhte.rss" },
  { name: "Nhân Dân - Khoa học",      url: "https://nhandan.vn/rss/khoahoc.rss" },
  { name: "VietnamPlus - Kinh tế",    url: "https://www.vietnamplus.vn/rss/kinhte.rss" },
  { name: "VietnamNet - Kinh doanh",  url: "https://vietnamnet.vn/rss/kinh-doanh.rss" },
];

// Keyword pre-filter: khớp title/description tiếng Việt chủ đề điện/năng lượng.
// Negative lookahead loại "điện thoại", "điện tử" (tránh false positive).
const KEYWORD_RE = /\b(EVN|BESS|điện(?!\s*(thoại|tử|ảnh|máy))|năng\s*lượng|điện\s*lực|điện\s*gió|điện\s*mặt\s*trời|điện\s*hạt\s*nhân|điện\s*sinh\s*khối|thủy\s*điện|nhiệt\s*điện|lưới\s*điện|cung\s*ứng\s*điện|giá\s*điện|tiết\s*kiệm\s*điện|pin\s*lưu\s*trữ|hydro\s*xanh|xe\s*điện|Bộ\s*Công\s*Thương|Cục\s*Điện\s*lực|NLTT)/i;

const UA = "Mozilla/5.0 (compatible; Luot247Bot/0.2)";
const WINDOW_MS = 48 * 60 * 60 * 1000; // 48h để test rộng hơn
const MODEL = "claude-haiku-4-5-20251001";
const LIMIT = parseInt(process.env.LIMIT ?? "80", 10);
const NO_LLM = !!process.env.NO_LLM;

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!NO_LLM && !API_KEY) {
  console.error("Thiếu ANTHROPIC_API_KEY. Set env hoặc dùng NO_LLM=1.");
  process.exit(1);
}

// ---------- Parse RSS ----------
function unescapeXml(s) {
  return (s ?? "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'").replace(/&nbsp;/g, " ");
}

function stripHtml(s) {
  return (s ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function parseRss(xml) {
  const items = [];
  const matches = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const it of matches) {
    const pick = (tag) => {
      const m = it.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
      return m ? unescapeXml(m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim()) : "";
    };
    const title = pick("title");
    let link = pick("link");
    if (!link) {
      const gm = it.match(/<guid[^>]*>([\s\S]*?)<\/guid>/);
      if (gm) link = unescapeXml(gm[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim());
    }
    const pubDate = pick("pubDate");
    const description = stripHtml(pick("description"));
    if (link && title) items.push({ title, link, pubDate, description });
  }
  return items;
}

async function fetchFeed(feed) {
  const res = await fetch(feed.url, { headers: { "User-Agent": UA }, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  return parseRss(xml).map((i) => ({ ...i, sourceName: feed.name }));
}

// ---------- LLM filter ----------
const SYSTEM_PROMPT = `Bạn phân loại tin tức cho trang tổng hợp ngành điện/năng lượng Việt Nam. Xác định bài có LIÊN QUAN hay không.

LIÊN QUAN (pass):
- Ngành điện VN: EVN, sản xuất/truyền tải/phân phối điện, giá điện, cung ứng điện, lưới điện, tiết kiệm điện, an ninh năng lượng
- Nguồn điện: điện gió, điện mặt trời, điện hạt nhân, thủy điện, nhiệt điện, sinh khối, LNG, khí
- Chính sách/pháp lý: luật điện lực, quy hoạch điện, chính sách năng lượng VN
- Xu hướng ngành toàn cầu ảnh hưởng VN: giá dầu/khí thế giới tác động điện VN, công nghệ BESS/hydrogen, chuỗi cung ứng NLTT quốc tế
- Hạ tầng năng lượng: LNG terminal, kho cảng, đường dây 500kV, trạm biến áp, nhà máy điện
- Chuyển đổi năng lượng xanh, giảm phát thải ngành điện

KHÔNG LIÊN QUAN (reject):
- Xe điện cá nhân/ô tô thương mại (Porsche, Tesla, VinFast sản phẩm), trạm sạc xe
- Thiết bị điện gia dụng, điện thoại, điện tử tiêu dùng
- Tài chính doanh nghiệp không liên quan điện (cổ tức, ĐHĐCĐ chung)
- Xăng dầu thuần (trừ khi gắn trực tiếp với điện/khí/LNG)
- Crypto/tiền điện tử, thời tiết thuần túy, showbiz, thể thao
- Giá USD/vàng, kinh tế vĩ mô không đề cập ngành điện
- Tin quốc tế không liên quan VN và không phải xu hướng ngành điện toàn cầu

LƯU Ý: Tin quốc tế về điện mặt trời/gió/hạt nhân toàn cầu VẪN pass (là xu hướng ngành). Tin dầu mỏ Trung Đông chỉ pass nếu bài bàn về tác động giá điện/năng lượng.

TRẢ VỀ: MẢNG JSON thuần, không markdown. Mỗi phần tử: {"relevant": bool, "confidence": 0.0-1.0, "reason": "≤12 từ"}`;

async function classifyBatch(items) {
  const batchSize = 10;
  const results = new Array(items.length);
  let totalIn = 0, totalOut = 0;

  for (let start = 0; start < items.length; start += batchSize) {
    const batch = items.slice(start, start + batchSize);
    const userMsg = `Phân loại ${batch.length} bài, trả MẢNG JSON ${batch.length} phần tử theo đúng thứ tự.

${batch.map((c, i) => `[${i}] TITLE: ${c.title}\nDESC: ${(c.description || "").slice(0, 180)}`).join("\n\n")}`;

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
      throw new Error(`Claude HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const data = await res.json();
    totalIn += data.usage?.input_tokens ?? 0;
    totalOut += data.usage?.output_tokens ?? 0;

    const text = data.content?.[0]?.text ?? "[]";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    let parsed;
    try {
      parsed = JSON.parse(jsonMatch?.[0] ?? text);
    } catch {
      parsed = batch.map(() => ({ relevant: null, confidence: 0, reason: "parse-fail" }));
    }
    for (let i = 0; i < batch.length; i++) results[start + i] = parsed[i] ?? {};
  }
  return { results, totalIn, totalOut };
}

// ---------- Main ----------
async function main() {
  console.log(`\n=== POC v2: Discovery từ ${FEEDS.length} RSS báo VN ===\n`);

  // Step 1: Parallel fetch all feeds
  console.log("1. Fetch feeds...");
  const t0 = Date.now();
  const feedResults = await Promise.allSettled(FEEDS.map((f) => fetchFeed(f)));
  const feedStats = [];
  const allItems = [];
  for (let i = 0; i < FEEDS.length; i++) {
    const f = FEEDS[i];
    const r = feedResults[i];
    if (r.status === "fulfilled") {
      feedStats.push({ name: f.name, count: r.value.length, ok: true });
      allItems.push(...r.value);
    } else {
      feedStats.push({ name: f.name, error: r.reason?.message, ok: false });
    }
  }
  console.log(`   ${allItems.length} items total, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  for (const s of feedStats) {
    if (s.ok) console.log(`   ✓ ${s.count.toString().padStart(3)}  ${s.name}`);
    else console.log(`   ✗        ${s.name}: ${s.error}`);
  }

  // Step 2: Window filter (48h) + dedupe URL
  const now = Date.now();
  const byUrl = new Map();
  for (const it of allItems) {
    const pubMs = it.pubDate ? Date.parse(it.pubDate) : NaN;
    if (!isNaN(pubMs) && now - pubMs > WINDOW_MS) continue;
    if (!byUrl.has(it.link)) byUrl.set(it.link, it);
  }
  console.log(`\n2. Sau dedupe + window ≤48h: ${byUrl.size} bài`);

  // Step 3: Keyword pre-filter
  const candidates = [];
  for (const it of byUrl.values()) {
    const blob = `${it.title} ${it.description}`;
    if (KEYWORD_RE.test(blob)) candidates.push(it);
  }
  candidates.sort((a, b) => (Date.parse(b.pubDate) || 0) - (Date.parse(a.pubDate) || 0));
  console.log(`3. Sau keyword filter: ${candidates.length} bài (${(candidates.length / byUrl.size * 100).toFixed(0)}% pass keyword)`);

  const toClassify = candidates.slice(0, LIMIT);
  console.log(`   → classify ${toClassify.length} bài (LIMIT=${LIMIT})`);

  if (NO_LLM) {
    console.log("\n## 30 bài đầu (chưa LLM filter):");
    for (const c of toClassify.slice(0, 30)) {
      const host = (() => { try { return new URL(c.link).host.replace(/^www\./, ""); } catch { return "?"; } })();
      const dt = c.pubDate ? new Date(c.pubDate).toISOString().slice(5, 16).replace("T", " ") : "?";
      console.log(`  [${dt}] ${host}`);
      console.log(`  ${c.title}`);
    }
    return;
  }

  // Step 4: LLM classify
  console.log("\n4. LLM classify (Claude Haiku 4.5)...");
  const tLLM = Date.now();
  const { results, totalIn, totalOut } = await classifyBatch(toClassify);
  const cost = (totalIn * 1 / 1_000_000) + (totalOut * 5 / 1_000_000);
  console.log(`   Done ${((Date.now() - tLLM) / 1000).toFixed(1)}s. Tokens: in=${totalIn}, out=${totalOut}. Cost: $${cost.toFixed(4)}`);

  const pass = [], reject = [];
  for (let i = 0; i < toClassify.length; i++) {
    const c = { ...toClassify[i], ...results[i] };
    if (c.relevant === true) pass.push(c);
    else reject.push(c);
  }

  console.log("\n" + "=".repeat(80));
  console.log(`KẾT QUẢ`);
  console.log("=".repeat(80));
  console.log(`✓ Pass:   ${pass.length}/${toClassify.length} (${(pass.length / toClassify.length * 100).toFixed(0)}%)`);
  console.log(`✗ Reject: ${reject.length}/${toClassify.length}`);
  console.log(`Cost: $${cost.toFixed(4)} cho ${toClassify.length} bài`);
  console.log(`Extrapolate: nếu ngày ~${candidates.length} bài qua keyword → filter cost ~$${(cost / toClassify.length * candidates.length * 24 / 48).toFixed(3)}/ngày`);

  console.log("\n## BÀI PASS (top 20):");
  for (const c of pass.slice(0, 20)) {
    const host = (() => { try { return new URL(c.link).host.replace(/^www\./, ""); } catch { return "?"; } })();
    const dt = c.pubDate ? new Date(c.pubDate).toISOString().slice(5, 16).replace("T", " ") : "?";
    console.log(`\n  [${dt}] ${host} (conf ${c.confidence ?? "?"})`);
    console.log(`  ${c.title}`);
    console.log(`  ${c.link.slice(0, 110)}${c.link.length > 110 ? "..." : ""}`);
  }

  console.log("\n## BÀI REJECT (sample 15):");
  for (const c of reject.slice(0, 15)) {
    console.log(`  ✗ ${(c.title ?? "").slice(0, 80)} — ${c.reason}`);
  }

  // Domain stats
  const byDomain = new Map();
  for (const c of pass) {
    try {
      const h = new URL(c.link).host.replace(/^www\./, "");
      byDomain.set(h, (byDomain.get(h) || 0) + 1);
    } catch { /* ignore */ }
  }
  console.log("\n## Domain pass (URL gốc):");
  for (const [d, n] of Array.from(byDomain.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}  ${d}`);
  }

  console.log("\n" + "=".repeat(80));
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
