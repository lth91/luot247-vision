-- Phase E + B: Playwright handover schema.
-- Cho phép Phase E discover candidate site không có RSS nhưng sample đẹp →
-- INSERT row trực tiếp với feed_type='playwright' + scraper_config jsonb chứa
-- list_url/link_pattern AI suy luận. Mac Mini scraper đọc DB cho rows
-- feed_type='playwright' (thay vì hardcode sources.py) → cào tự động.
--
-- pending_review=true để Mac Mini test 24h trước khi flip is_active=true.
-- Một cron riêng (chưa schedule trong migration này) sẽ auto-flip nếu Mac Mini
-- insert được bài cho source_id này trong 24h đầu (proof-of-life).

ALTER TABLE public.electricity_sources
  ADD COLUMN IF NOT EXISTS scraper_config jsonb,
  ADD COLUMN IF NOT EXISTS pending_review boolean NOT NULL DEFAULT false;

-- Mở rộng feed_type CHECK để cho phép 'playwright'. Schema cũ chỉ allow
-- 'rss' và 'html_list' → Phase E INSERT 'playwright' bị reject silent
-- (rơi xuống fallthrough reject_no_rss). Sự cố audit 2026-05-04.
ALTER TABLE public.electricity_sources
  DROP CONSTRAINT IF EXISTS electricity_sources_feed_type_check;

ALTER TABLE public.electricity_sources
  ADD CONSTRAINT electricity_sources_feed_type_check
  CHECK (feed_type = ANY (ARRAY['rss'::text, 'html_list'::text, 'playwright'::text]));

COMMENT ON COLUMN public.electricity_sources.scraper_config IS
  'JSON config cho Mac Mini Playwright scraper: {list_url, link_pattern, content_selector, wait_for, wait_after_load_ms, category}. Chỉ relevant khi feed_type=playwright.';

COMMENT ON COLUMN public.electricity_sources.pending_review IS
  'True = Phase E vừa add row Playwright tự động, Mac Mini đang test 24h. Cron auto-flip sang is_active=true nếu có bài insert trong window.';

-- Index cho Mac Mini fetch nhanh: WHERE feed_type='playwright' AND (is_active OR pending_review)
CREATE INDEX IF NOT EXISTS idx_electricity_sources_playwright
  ON public.electricity_sources (feed_type)
  WHERE feed_type = 'playwright';

-- Mở rộng status enum của source_candidate_log: thêm 'added_playwright_pending'
-- Phase E sẽ dùng status này khi candidate vào pipeline Playwright thay vì RSS.
ALTER TABLE public.source_candidate_log
  DROP CONSTRAINT IF EXISTS source_candidate_log_status_check;

ALTER TABLE public.source_candidate_log
  ADD CONSTRAINT source_candidate_log_status_check
  CHECK (status IN (
    'added',
    'added_playwright_pending',
    'rejected_existing',
    'rejected_probe_fail',
    'rejected_low_count',
    'rejected_anti_bot',
    'rejected_no_rss',
    'rejected_daily_limit'
  ));
