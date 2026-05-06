-- Switch nguoiquansat.vn from Playwright to RSS.
-- Lý do: Cloudflare ban Googlebot UA sau 4 bài catch (5h). Source RSS hợp lệ
-- tại https://nguoiquansat.vn/rss/trang-chu (RSS 2.0, all categories) → edge
-- crawler có thể xử lý độc lập, không phụ thuộc Mac Mini, không bị Cloudflare
-- chặn (RSS không trigger anti-bot challenge).
--
-- Plan: disable Mac Mini Playwright row (giữ history 4 articles), insert RSS
-- row mới. Cùng base_url nhưng khác source_id, dedup theo url_hash sẽ tự lo.

UPDATE electricity_sources
SET is_active = false,
    pending_review = false,
    last_error = 'manual disable: Cloudflare ban Googlebot UA after 4 articles. Switched to RSS source nguoiquansat.vn/rss/trang-chu',
    disabled_at = now()
WHERE id = 'dc1530a1-f83c-4c8e-82b5-b500165d9e3e';

INSERT INTO electricity_sources (
  name, base_url, list_url, feed_type,
  list_link_pattern, article_content_selector,
  category, tier, is_active, pending_review,
  consecutive_failures
) VALUES (
  'nguoiquansat.vn',
  'https://nguoiquansat.vn',
  'https://nguoiquansat.vn/rss/trang-chu',
  'rss',
  NULL,
  NULL,
  'bao-chi',
  3,
  true,
  false,
  0
);
