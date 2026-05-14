-- Phase E Mac Mini Playwright handover cho 5 nguồn báo tài chính/chính sách
-- thường xuất bài chuyên đề điện nhưng chưa được crawl. QA 5/14: 5 bài bị
-- miss từ các domain này (#11 TIG, #13 LNG Thái Bình, #15 đôn đốc QHĐ8,
-- #17 LNG Quỳnh Lập, #25 Meta điện không gian, #26 PC1, #27 Huawei...).
--
-- Tất cả là tier 3, broad-news; keyword filter sync (TS canonical + Python
-- topic_filter.py) sẽ reject ~95% bài off-topic trên Mac Mini side.
--
-- pending_review=true + is_active=false → Mac Mini scraper attempt crawl;
-- lifecycle cron sau 24h flip is_active=true nếu ≥1 article catch.

INSERT INTO electricity_sources (
  name, base_url, list_url, feed_type, list_link_pattern,
  article_content_selector, category, is_active, pending_review, tier,
  scraper_config, last_error
) VALUES
(
  'Mac Mini (kinhtechungkhoan.vn)',
  'https://kinhtechungkhoan.vn',
  'https://kinhtechungkhoan.vn/',
  'playwright',
  '^/[a-z0-9-]+-\d+\.html$',
  null,
  'bao-chi',
  false,
  true,
  3,
  jsonb_build_object(
    'category', 'bao-chi',
    'list_url', 'https://kinhtechungkhoan.vn/',
    'link_pattern', '^/[a-z0-9-]+-\d+\.html$',
    'content_selector', null,
    'wait_after_load_ms', 4000
  ),
  'manual handover 2026-05-14 from QA 5/14: 2 bài miss (#13 LNG Thái Bình, #26 PC1)'
),
(
  'Mac Mini (daibieunhandan.vn)',
  'https://daibieunhandan.vn',
  'https://daibieunhandan.vn/',
  'playwright',
  '^/[a-z0-9-]+-\d+\.html$',
  null,
  'co-quan',
  false,
  true,
  3,
  jsonb_build_object(
    'category', 'co-quan',
    'list_url', 'https://daibieunhandan.vn/',
    'link_pattern', '^/[a-z0-9-]+-\d+\.html$',
    'content_selector', null,
    'wait_after_load_ms', 4000
  ),
  'manual handover 2026-05-14: báo Quốc hội — bài chính sách QHĐ8, đôn đốc dự án (#15)'
),
(
  'Mac Mini (baoxaydung.vn)',
  'https://baoxaydung.vn',
  'https://baoxaydung.vn/',
  'playwright',
  '^/[a-z0-9-]+-\d{15,}\.htm$',
  null,
  'bao-chi',
  false,
  true,
  3,
  jsonb_build_object(
    'category', 'bao-chi',
    'list_url', 'https://baoxaydung.vn/',
    'link_pattern', '^/[a-z0-9-]+-\d{15,}\.htm$',
    'content_selector', null,
    'wait_after_load_ms', 4000
  ),
  'manual handover 2026-05-14: bài #25 Meta điện mặt trời không gian. URL .htm (KHÔNG .html), 15+ digits ID'
),
(
  'Mac Mini (viettimes.vn)',
  'https://viettimes.vn',
  'https://viettimes.vn/',
  'playwright',
  '^/[a-z0-9-]+-post\d+\.html$',
  null,
  'bao-chi',
  false,
  true,
  3,
  jsonb_build_object(
    'category', 'bao-chi',
    'list_url', 'https://viettimes.vn/',
    'link_pattern', '^/[a-z0-9-]+-post\d+\.html$',
    'content_selector', null,
    'wait_after_load_ms', 4000
  ),
  'manual handover 2026-05-14: bài #9 Sao Mai An Giang. URL pattern post-prefix ID'
),
(
  'Mac Mini (mekongasean.vn)',
  'https://mekongasean.vn',
  'https://mekongasean.vn/',
  'playwright',
  '^/[a-z0-9-]+-\d{5,}\.html$',
  null,
  'bao-chi',
  false,
  true,
  3,
  jsonb_build_object(
    'category', 'bao-chi',
    'list_url', 'https://mekongasean.vn/',
    'link_pattern', '^/[a-z0-9-]+-\d{5,}\.html$',
    'content_selector', null,
    'wait_after_load_ms', 4000
  ),
  'manual handover 2026-05-14: bài #8 Hà Đô (đã catch via cafef variant nhưng cần direct)'
);
