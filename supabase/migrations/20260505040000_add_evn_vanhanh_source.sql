-- Add EVN Vận hành source (category 60-2015) — bổ sung cho EVN current
-- (category 60-12 Sự kiện).
--
-- Lý do: Bài "Thông tin chung về vận hành hệ thống điện Quốc gia ngày X"
-- (daily operational reports) thuộc category 60-2015 (Vận hành), không phải
-- 60-12 (Sự kiện). EVN current source list_url chỉ cover 60-12 → miss
-- toàn bộ daily reports.
--
-- Pattern + selector copy từ EVN current source (cùng schema URL).

INSERT INTO public.electricity_sources (
  name, base_url, list_url, feed_type, list_link_pattern,
  article_content_selector, category, tier, is_active
)
SELECT
  'EVN - Vận hành',
  'https://www.evn.com.vn',
  'https://www.evn.com.vn/vi-VN/news-l/Thong-tin-Van-hanh-he-thong-dien-60-2015',
  'html_list',
  '/d/vi-VN/news(?:-gallery)?/[^/]+-\d+-\d+-\d+',
  'div.news-detail, div.content-detail, article',
  'co-quan',
  1,
  true
WHERE NOT EXISTS (SELECT 1 FROM public.electricity_sources WHERE name = 'EVN - Vận hành');
