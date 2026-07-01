// sitemap.xml ĐỘNG: các trang chính + tối đa 5000 bài mới nhất (/tin/:id).
// Bài được liệt kê vì mỗi /tin/:id đã có nội dung riêng cho bot (xem api/og.js).
// Giới hạn 5000 để dưới ngưỡng sitemap (50k URL / 50MB) + phản hồi nhanh; bài
// cũ hơn ít quan trọng cho index. Cache CDN 1h.

const SUPABASE_URL = "https://gklpvaindbfkcmuuuffz.supabase.co";
const SUPABASE_KEY = "sb_publishable_59MPtkp-OomPq0A4RdtX9A_4AsLLzO7";
const SITE = "https://luot247.com";
const LIMIT = 5000;

const STATIC = [
  { loc: "/", changefreq: "hourly", priority: "1.0" },
  { loc: "/bang-xep-hang", changefreq: "daily", priority: "0.5" },
  { loc: "/about", changefreq: "monthly", priority: "0.3" },
];

const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export default async function handler(req, res) {
  let items = [];
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/news?select=id,updated_at&is_approved=eq.true&order=updated_at.desc&limit=${LIMIT}`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } },
    );
    if (r.ok) items = await r.json();
  } catch (e) {
    // lỗi → vẫn trả sitemap các trang chính
  }

  const urls = [];
  for (const s of STATIC) {
    urls.push(
      `<url><loc>${SITE}${s.loc}</loc><changefreq>${s.changefreq}</changefreq><priority>${s.priority}</priority></url>`,
    );
  }
  for (const it of items) {
    let lastmod = "";
    try {
      if (it.updated_at) lastmod = `<lastmod>${new Date(it.updated_at).toISOString()}</lastmod>`;
    } catch (e) { /* bỏ lastmod nếu ngày lỗi */ }
    urls.push(
      `<url><loc>${SITE}/tin/${esc(it.id)}</loc>${lastmod}<changefreq>weekly</changefreq><priority>0.6</priority></url>`,
    );
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
  res.status(200).send(xml);
}
