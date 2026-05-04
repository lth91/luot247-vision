-- Cron lifecycle cho rows electricity_sources có pending_review=true
-- (Phase E auto-handover Playwright). 2 hành vi:
--
-- 1. PROMOTE: pending source insert được bài trong 24h → flip pending_review=false,
--    is_active=true. Đây là proof-of-life của adapter Playwright (link_pattern
--    Phase E suy luận đúng + Mac Mini extract content_selector OK).
--
-- 2. REJECT: pending sau 7 ngày vẫn 0 bài → flip pending_review=false,
--    is_active=false vĩnh viễn (last_error có keyword "manual disable" để
--    auto_reenable cron không lật). Cần human review để sửa scraper_config tay.
--
-- Cron 05:00 UTC daily: lệch khỏi cleanup 02:30, daily-digest 02:00,
-- discover 03:00, auto-fix-selector 04:00.

CREATE OR REPLACE FUNCTION public.lifecycle_pending_playwright()
RETURNS TABLE(promoted int, rejected int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_promoted int := 0;
  v_rejected int := 0;
BEGIN
  -- 1. Promote: pending source có bài insert trong 24h gần nhất
  WITH proven AS (
    SELECT DISTINCT s.id, s.last_error
    FROM public.electricity_sources s
    JOIN public.electricity_news n ON n.source_id = s.id
    WHERE s.pending_review = true
      AND s.feed_type = 'playwright'
      AND n.crawled_at >= now() - interval '24 hours'
  ),
  upd AS (
    UPDATE public.electricity_sources s
    SET pending_review = false,
        is_active = true,
        last_error = 'auto-promoted ' || to_char(now(), 'YYYY-MM-DD') ||
                     ': Mac Mini insert bài trong 24h, scraper_config validated. Was: ' ||
                     left(coalesce(s.last_error, ''), 200)
    FROM proven
    WHERE s.id = proven.id
    RETURNING s.id
  )
  SELECT count(*)::int INTO v_promoted FROM upd;

  -- 2. Reject: pending source ≥7 ngày tuổi (theo created_at) vẫn 0 bài
  WITH stale AS (
    SELECT s.id
    FROM public.electricity_sources s
    LEFT JOIN public.electricity_news n ON n.source_id = s.id
    WHERE s.pending_review = true
      AND s.feed_type = 'playwright'
      AND s.created_at < now() - interval '7 days'
    GROUP BY s.id
    HAVING COUNT(n.id) = 0
  ),
  rej AS (
    UPDATE public.electricity_sources
    SET pending_review = false,
        is_active = false,
        last_error = 'manual disable ' || to_char(now(), 'YYYY-MM-DD') ||
                     ': Phase E Playwright handover timeout 7 ngày, 0 bài. ' ||
                     'link_pattern không match hoặc Mac Mini extractor fail. Cần human review scraper_config.'
    WHERE id IN (SELECT id FROM stale)
    RETURNING id
  )
  SELECT count(*)::int INTO v_rejected FROM rej;

  RETURN QUERY SELECT v_promoted, v_rejected;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.lifecycle_pending_playwright() FROM anon, authenticated, public;

DO $$ BEGIN
  PERFORM cron.unschedule('pending-playwright-lifecycle');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'pending-playwright-lifecycle',
  '0 5 * * *',
  $$SELECT public.lifecycle_pending_playwright();$$
);
