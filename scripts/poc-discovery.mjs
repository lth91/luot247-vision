#!/usr/bin/env node
// POC: Discovery tin ngành điện/năng lượng VN từ Google News RSS.
// Chạy: node scripts/poc-discovery.mjs
// Kết quả in ra danh sách URL ứng viên — chưa gọi LLM, chưa insert DB.

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
const WINDOW_MS = 24 * 60 * 60 * 1000; // chỉ lấy bài ≤ 24h

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
    if (link) items.push({ title, link, pubDate, source });
  }
  return items;
}

// Google News redirect URL → URL gốc nếu có thể.
// Google News format: https://news.google.com/rss/articles/CBM...?...
// Thực tế decode rất phức tạp; giữ nguyên URL Google, để downstream fetch follow redirect.
function normalizeUrl(u) {
  try {
    const url = new URL(u);
    return url.toString();
  } catch {
    return null;
  }
}

async function fetchQuery(q) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=vi&gl=VN&ceid=VN:vi`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${q}: HTTP ${res.status}`);
  const xml = await res.text();
  return parseRssItems(xml);
}

async function main() {
  const t0 = Date.now();
  const all = new Map(); // key: link → {title, pubDate, source, queries:[]}
  const perQuery = [];

  for (const q of QUERIES) {
    try {
      const items = await fetchQuery(q);
      perQuery.push({ query: q, count: items.length });
      const now = Date.now();
      for (const it of items) {
        const link = normalizeUrl(it.link);
        if (!link) continue;
        const pubMs = it.pubDate ? Date.parse(it.pubDate) : NaN;
        if (!isNaN(pubMs) && now - pubMs > WINDOW_MS) continue;
        const existing = all.get(link);
        if (existing) {
          existing.queries.push(q);
        } else {
          all.set(link, { ...it, queries: [q] });
        }
      }
    } catch (e) {
      perQuery.push({ query: q, error: e.message });
    }
  }

  const candidates = Array.from(all.values()).sort((a, b) => {
    const ta = Date.parse(a.pubDate || 0) || 0;
    const tb = Date.parse(b.pubDate || 0) || 0;
    return tb - ta;
  });

  // Thống kê theo source
  const bySource = new Map();
  for (const c of candidates) {
    bySource.set(c.source, (bySource.get(c.source) || 0) + 1);
  }

  console.log("=".repeat(80));
  console.log(`POC Discovery — ${QUERIES.length} queries, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log("=".repeat(80));
  console.log("\n## Thống kê per query:");
  for (const p of perQuery) {
    if (p.error) console.log(`  ❌ ${p.query.padEnd(35)} — ${p.error}`);
    else console.log(`  ✓ ${p.query.padEnd(35)} — ${p.count} bài`);
  }

  console.log(`\n## Tổng ứng viên (≤24h, dedupe): ${candidates.length}`);

  console.log("\n## Top nguồn xuất hiện:");
  const sortedSources = Array.from(bySource.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20);
  for (const [src, n] of sortedSources) {
    console.log(`  ${String(n).padStart(3)}  ${src || "(không rõ)"}`);
  }

  console.log("\n## 30 bài mới nhất:");
  for (const c of candidates.slice(0, 30)) {
    const dt = c.pubDate ? new Date(c.pubDate).toISOString().replace("T", " ").slice(0, 16) : "(no date)";
    console.log(`\n  [${dt}] ${c.source}`);
    console.log(`  ${c.title}`);
    console.log(`  ${c.link.slice(0, 110)}${c.link.length > 110 ? "..." : ""}`);
    if (c.queries.length > 1) console.log(`  ← match: ${c.queries.join(", ")}`);
  }

  console.log("\n" + "=".repeat(80));
  console.log(`Total unique candidates: ${candidates.length}`);
  console.log(`Unique sources: ${bySource.size}`);
  console.log("=".repeat(80));
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
