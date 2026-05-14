-- Same-domain coverage fix sau QA 5/14:
-- 27 bài nhân viên gửi → coverage 33% (9/27). 3 bài lọt mặc dù domain
-- đang active vì list_url chưa cover đúng section:
--   #2  nangluongvietnam.vn/dien-mat-troi-mai-nha...-36019.html
--       → section "Năng lượng tái tạo" chưa được scan
--   #4  congthuong.vn/tinh-yamanashi...-456314.html
--       → section "Thời sự" chưa được scan (bài Bộ Công Thương + đối ngoại)
--   #24 evn.com.vn/d/vi-VN/news/Luu-tru-...112GW-60-2020-507986
--       → section "Điện thế giới" (60-2020) chưa được scan
--
-- Tier 3 cho /thoi-su vì broad section — keyword filter sẽ reject ~95%
-- bài chính trị/lifestyle off-topic, chỉ giữ tin chuyên đề ngành điện.

INSERT INTO electricity_sources (
  name, base_url, list_url, feed_type, list_link_pattern,
  article_content_selector, category, is_active, tier
) VALUES
(
  'Hiệp hội NL Việt Nam - Năng lượng tái tạo',
  'https://nangluongvietnam.vn',
  'https://nangluongvietnam.vn/dien-hat-nhan-nang-luong-tai-tao',
  'html_list',
  '/.+-\d+\.html',
  'div.article-content, article.fck_detail, div.detail-content',
  'doanh-nghiep',
  true,
  1
),
(
  'EVN - Điện thế giới',
  'https://www.evn.com.vn',
  'https://www.evn.com.vn/vi-VN/news-l/Dien-the-gioi-60-2020',
  'html_list',
  '/d/vi-VN/news(?:-gallery)?/[^/]+-\d+-\d+-\d+',
  'div.news-detail, div.content-detail, article',
  'co-quan',
  true,
  1
),
(
  'Báo Công Thương - Thời sự',
  'https://congthuong.vn',
  'https://congthuong.vn/thoi-su',
  'html_list',
  '/.+-\d+\.html',
  'div.article-content, article.fck_detail, div.detail-content',
  'bao-chi',
  true,
  3
);
