// Dynamic rendering cho /tin/:id — trả HTML có OG meta + nội dung bài cho BOT
// (FB/Zalo/Twitter preview + Googlebot index). Người dùng THẬT vẫn vào SPA
// (vercel.json chỉ rewrite sang đây khi user-agent là bot). Nội dung khớp bài
// người dùng xem → là "dynamic rendering" hợp lệ, không phải cloaking.

const SUPABASE_URL = "https://gklpvaindbfkcmuuuffz.supabase.co";
const SUPABASE_KEY = "sb_publishable_59MPtkp-OomPq0A4RdtX9A_4AsLLzO7";
const SITE = "https://luot247.com";
const OG_IMAGE = `${SITE}/og-image.png`;
const DEFAULT_TITLE = "LƯỚT 247 - Góc nhìn Việt Nam";
const DEFAULT_DESC = "Ngắn gọn, dễ đọc, chọn lọc từ báo chí. Cập nhật liên tục, phục vụ cộng đồng.";

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export default async function handler(req, res) {
  const id = (req.query?.id ?? "").toString();
  let title = DEFAULT_TITLE;
  let desc = DEFAULT_DESC;
  let content = "";

  try {
    if (id) {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/news?id=eq.${encodeURIComponent(id)}&is_approved=eq.true&select=title,description&limit=1`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } },
      );
      if (r.ok) {
        const rows = await r.json();
        if (rows && rows[0]) {
          title = rows[0].title || title;
          content = (rows[0].description || "").trim();
          desc = content.replace(/\s+/g, " ").slice(0, 200) || desc;
        }
      }
    }
  } catch (e) {
    // lỗi → dùng meta mặc định
  }

  const url = `${SITE}/tin/${esc(id)}`;
  const paras = content
    .split(/\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p)}</p>`)
    .join("\n");

  const html = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — LƯỚT 247</title>
<link rel="canonical" href="${url}">
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="LƯỚT 247">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${OG_IMAGE}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${OG_IMAGE}">
</head>
<body>
<article>
<h1>${esc(title)}</h1>
${paras}
<p><a href="${url}">Đọc trên LƯỚT 247</a></p>
</article>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
  res.status(200).send(html);
}
