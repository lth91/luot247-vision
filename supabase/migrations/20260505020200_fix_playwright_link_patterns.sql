-- Fix link_pattern cho 3 Playwright source 0 articles sau cron 8:20 VN ngày 5/5.
--
-- Vấn đề:
--   • vietnam.vn: pattern '^/[a-z0-9-]+\d{4,}' yêu cầu URL có 4+ digits cuối,
--     nhưng vietnam.vn dùng slug thuần (không digit, không extension).
--     Kết quả: 0 link match.
--   • plo.vn: pattern '^/.+\.html$' quá rộng, match cả utility pages
--     ('/lich-tu-van.html', '/danh-cho-ban.html', '/gop-y.html'). Mac Mini
--     fetch 8 link nhưng tất cả utility pages → no published_at.
--   • tapchicongthuong.vn: pattern '^/.+\.htm$' quá rộng, match cả list pages
--     ('/su-kien.htm', '/hashtag/...htm'). Tương tự no published_at.
--
-- Pattern mới (derived từ inspect homepage thật):
--   • vietnam.vn: '^/[a-z0-9-]{20,}$' — slug ≥20 chars, không extension.
--     Skip /favicon.ico, /about. Giữ slug bài thật như
--     /banh-mi-lot-top-the-gioi-nguoi-dan-hanh-dien-ve-suc-hut-cua-am-thuc-viet
--   • tapchicongthuong.vn: '^/[^/]+-\d{5,}\.htm$' — slug + 5+ digit ID + .htm.
--     Skip /an-pham.htm, /doc-nhieu-nhat.htm, /hashtag/foo-4.htm
--   • plo.vn: '^/[a-z0-9-]{30,}\.html$' — slug ≥30 chars + .html.
--     Skip /lich-tu-van.html (12 chars), /danh-cho-ban.html (13), /gop-y.html (5)
--
-- Topic filter (luot247-scraper commit 01aad2f) sẽ là tầng safety net thứ hai —
-- ngay cả khi pattern lỡ bắt page list, content sẽ bị filter nếu không match
-- electricity keywords.

UPDATE public.electricity_sources
SET scraper_config = scraper_config || jsonb_build_object('link_pattern', new_pattern.pattern)
FROM (VALUES
  ('Mac Mini (vietnam.vn)',          '^/[a-z0-9-]{20,}$'),
  ('Mac Mini (tapchicongthuong.vn)', '^/[^/]+-\d{5,}\.htm$'),
  ('Mac Mini (plo.vn)',              '^/[a-z0-9-]{30,}\.html$')
) AS new_pattern(name, pattern)
WHERE public.electricity_sources.name = new_pattern.name;
