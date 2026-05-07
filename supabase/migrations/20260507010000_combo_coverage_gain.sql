-- Combo coverage gain — 4 actions (commit batch 25 audit, coverage 28%):
--
-- 1. Discovery cron 1h → 30min (giảm window trôi 50% trước khi cycle scan)
-- 2. ADD electricity_source: kinhte.congthuong.vn (subdomain riêng từ /20)
-- 3. NLĐ giữ disabled (đã move sang Discovery FEEDS với /rss/kinh-te.rss
--    sectional + LLM classifier filter — thay vì list_url=homepage cũ)
--
-- Discovery FEEDS additions (code commit cùng): vietnambiz, bnews x2,
-- moitruong x2, nld kinh-te. HTML_FEEDS: mekongasean.

-- 1. Discovery cron 30 min thay vì 1h
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'discovery-rss-news-hourly'),
  schedule := '*/30 * * * *'
);

-- 2. Add kinhte.congthuong.vn subdomain
INSERT INTO electricity_sources (
  name, base_url, list_url, feed_type,
  list_link_pattern, article_content_selector,
  category, tier, is_active, pending_review, consecutive_failures
) VALUES (
  'Báo Công Thương Kinh tế (subdomain)',
  'https://kinhte.congthuong.vn',
  'https://kinhte.congthuong.vn',
  'html_list',
  '/.+-\d+\.html',
  'div.article-content, article.fck_detail, div.detail-content',
  'bao-chi', 2, true, false, 0
);
