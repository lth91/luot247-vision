-- Virtual source row cho Mac Mini Playwright scraper.
-- Scraper insert vào electricity_news với source_id pointing here.
-- Giống pattern "RSS Discovery" — không phải HTML scrape thật, chỉ làm FK + log last_crawled_at.
-- Repo: https://github.com/lth91/luot247-scraper

INSERT INTO public.electricity_sources (
  name, base_url, list_url, feed_type, list_link_pattern, article_content_selector, category, is_active
)
SELECT
  'Mac Mini Scraper',
  'https://news.luot247.com',
  'mac-mini-scraper',
  'html_list',
  NULL,
  NULL,
  'co-quan',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.electricity_sources WHERE name = 'Mac Mini Scraper'
);
