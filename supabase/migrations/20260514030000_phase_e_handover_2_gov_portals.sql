-- Phase E handover 2 portal UBND tỉnh — nguồn duy nhất cho tin chính sách
-- + dự án điện cấp tỉnh không có trên báo chí thường. QA 5/14:
--   #3  www.quangtri.gov.vn — bài nhà máy điện rác Nam Trạch
--   #10 lamdong.gov.vn      — bài rà soát Quy hoạch điện VIII
--
-- Lưu ý kỹ thuật cần Mac Mini handle:
--   - quangtri.gov.vn: SSL cert chain không hợp lệ → Playwright cần
--     `ignoreHTTPSErrors: true` trong context options
--   - lamdong.gov.vn: SharePoint CMS, URL .aspx, list page có thể requires
--     JS render thật sự lâu (>4s) → wait_after_load_ms=8000
--
-- Yield kỳ vọng: 1-3 bài/tháng/portal. Tier 3, sẽ tự disable nếu lifecycle
-- 24h không thấy article.

INSERT INTO electricity_sources (
  name, base_url, list_url, feed_type, list_link_pattern,
  article_content_selector, category, is_active, pending_review, tier,
  scraper_config, last_error
) VALUES
(
  'Mac Mini (lamdong.gov.vn)',
  'https://lamdong.gov.vn',
  'https://lamdong.gov.vn/HOME/news/hotnews/Lists/Posts/Posts.aspx',
  'playwright',
  '^/HOME/news/[a-z0-9_-]+/SitePages/[A-Za-z0-9-]+\.aspx$',
  null,
  'co-quan',
  false,
  true,
  3,
  jsonb_build_object(
    'category', 'co-quan',
    'list_url', 'https://lamdong.gov.vn/HOME/news/hotnews/Lists/Posts/Posts.aspx',
    'link_pattern', '^/HOME/news/[a-z0-9_-]+/SitePages/[A-Za-z0-9-]+\.aspx$',
    'content_selector', null,
    'wait_after_load_ms', 8000,
    'note', 'SharePoint CMS — JS-heavy, cần wait dài'
  ),
  'manual handover 2026-05-14: bài #10 QHĐ8 Lâm Đồng. SharePoint structure'
),
(
  'Mac Mini (quangtri.gov.vn)',
  'https://www.quangtri.gov.vn',
  'https://www.quangtri.gov.vn/tin-tuc',
  'playwright',
  '^/tin-tuc/[a-z0-9-]+$',
  null,
  'co-quan',
  false,
  true,
  3,
  jsonb_build_object(
    'category', 'co-quan',
    'list_url', 'https://www.quangtri.gov.vn/tin-tuc',
    'link_pattern', '^/tin-tuc/[a-z0-9-]+$',
    'content_selector', null,
    'wait_after_load_ms', 4000,
    'ignore_https_errors', true,
    'note', 'SSL cert chain không hợp lệ — bypass cert verification'
  ),
  'manual handover 2026-05-14: bài #3 nhà máy điện rác. SSL cert issue, cần ignoreHTTPSErrors'
);
