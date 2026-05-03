-- Phase B2 — thêm 2 source HTML T2 từ Phase A audit (doc 03/05/2026).
-- PV Power: nhà máy điện khí + LNG (PVN affiliate).
-- Trung Nam Group: điện gió + nhiệt điện LNG (renewable plant operator).
-- Cả 2 không có RSS, fetch HTML list page + extract bài detail.
-- Tier 2 (specialized power industry).
-- Idempotent qua NOT EXISTS check (table không có UNIQUE trên name).

INSERT INTO public.electricity_sources (
  name, base_url, list_url, feed_type, list_link_pattern,
  article_content_selector, category, tier, is_active, consecutive_failures
)
SELECT
  'PV Power',
  'https://pvpower.vn',
  'https://pvpower.vn/vi/tag/hoat-dong-pv-power-5.htm',
  'html_list',
  '/vi/post/.+-\d+\.htm',
  'div.article-content',
  'doanh-nghiep',
  2,
  true,
  0
WHERE NOT EXISTS (SELECT 1 FROM public.electricity_sources WHERE name = 'PV Power');

INSERT INTO public.electricity_sources (
  name, base_url, list_url, feed_type, list_link_pattern,
  article_content_selector, category, tier, is_active, consecutive_failures
)
SELECT
  'Trung Nam Group',
  'https://trungnamgroup.com.vn',
  'https://trungnamgroup.com.vn/tin-tuc/truyen-thong/truyen-thong',
  'html_list',
  '/tin-tuc/truyen-thong/truyen-thong/[a-z0-9-]+$',
  'div.canhcam-new-detail-1, div.content',
  'doanh-nghiep',
  2,
  true,
  0
WHERE NOT EXISTS (SELECT 1 FROM public.electricity_sources WHERE name = 'Trung Nam Group');
