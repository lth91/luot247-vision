-- Thêm 2 nguồn từ feedback nhân viên (audit 07/05): provincial báo + bộ KHCN.
-- Cả 2 server-rendered HTML, không cần Playwright. Tier 3 cho bao-chi, tier 2 cho gov.
--
-- Pattern strict cho baobacninhtv vì kinh-te section trộn nhiều topic; chỉ match
-- slug có token điện/năng lượng (giống pattern Báo Quốc Tế).
--
-- mst.gov.vn dùng section năng lượng nguyên tử (= điện hạt nhân) — 100% electricity-
-- relevant, pattern có thể loose hơn.

INSERT INTO public.electricity_sources (
  name, base_url, list_url, feed_type, list_link_pattern,
  article_content_selector, category, tier, is_active, pending_review
)
SELECT
  'Báo Bắc Ninh - Kinh tế',
  'https://baobacninhtv.vn',
  'https://baobacninhtv.vn/kinh-te',
  'html_list',
  '^/[^/]*(?:nganh-dien|dien-luc|dien-gio|dien-mat-troi|dien-hat-nhan|dien-khi|dien-than|dien-nang|dien-tai-tao|nhiet-dien|thuy-dien|xe-dien|nguon-dien|luoi-dien|gia-dien|tiet-kiem-dien|cung-ung-dien|phat-dien|tru-sac|tram-sac|san-xuat-dien|luu-tru-dien|mat-dien|cat-dien|nang-luong|nltt|nlmt|evn[a-z]*|bess|pin-luu-tru|hat-nhan|tua-bin)[^/]*-postid\d+\.bbg$',
  '#news-detail, div.article-content, article, div.content',
  'bao-chi',
  3,
  true,
  false
WHERE NOT EXISTS (SELECT 1 FROM public.electricity_sources WHERE name = 'Báo Bắc Ninh - Kinh tế');

INSERT INTO public.electricity_sources (
  name, base_url, list_url, feed_type, list_link_pattern,
  article_content_selector, category, tier, is_active, pending_review
)
SELECT
  'Bộ KHCN - Năng lượng nguyên tử',
  'https://mst.gov.vn',
  'https://mst.gov.vn/tin-tuc-su-kien/nang-luong-nguyen-tu.htm',
  'html_list',
  '^/[a-z0-9-]{20,}-\d{15,}\.htm$',
  'div.detail-content, #main-content, article, div.content',
  'co-quan',
  2,
  true,
  false
WHERE NOT EXISTS (SELECT 1 FROM public.electricity_sources WHERE name = 'Bộ KHCN - Năng lượng nguyên tử');
