-- Thêm virtual source "RSS Discovery" cho edge function discovery-rss-news.
-- Edge function sẽ insert electricity_news với source_id này (tin từ RSS Discovery
-- hiển thị trên dashboard với source_name bao gồm domain gốc).

INSERT INTO public.electricity_sources (name, base_url, list_url, feed_type, list_link_pattern, article_content_selector, category)
VALUES (
  'RSS Discovery',
  'https://news.luot247.com',
  'rss-discovery',
  'html_list',
  NULL,
  NULL,
  'bao-chi'
)
ON CONFLICT DO NOTHING;
