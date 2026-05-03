-- Auto re-enable nguồn đã bị edge function disable (consecutive_failures >= 10)
-- sau khi cooldown 24h, để xử lý các site tạm chặn / tạm down rồi phục hồi.
--
-- An toàn: chỉ re-enable nếu last_error trông giống lỗi transient (HTTP/timeout/abort/network).
-- Các nguồn được manual disable từ migration (vd redisable_blocked_from_edge với last_error
-- chứa "Edge IP" hoặc "manual") sẽ bị skip — không bị cron lật lại.

CREATE OR REPLACE FUNCTION public.auto_reenable_disabled_sources()
RETURNS TABLE(reenabled_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count int;
BEGIN
  WITH updated AS (
    UPDATE public.electricity_sources
    SET is_active = true,
        consecutive_failures = 0,
        last_error = 'auto re-enabled after 24h cooldown (was: ' || left(coalesce(last_error, ''), 200) || ')'
    WHERE is_active = false
      AND consecutive_failures >= 10
      AND last_crawled_at IS NOT NULL
      AND last_crawled_at < now() - interval '24 hours'
      AND (
        last_error ILIKE '%HTTP %'
        OR last_error ILIKE '%timeout%'
        OR last_error ILIKE '%aborted%'
        OR last_error ILIKE '%network%'
        OR last_error ILIKE '%fetch failed%'
      )
      AND last_error NOT ILIKE '%Edge IP%'
      AND last_error NOT ILIKE '%manual%'
      AND last_error NOT ILIKE '%auto re-enabled%'
    RETURNING id
  )
  SELECT count(*)::int INTO v_count FROM updated;

  RETURN QUERY SELECT v_count;
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('auto-reenable-sources-hourly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Chạy mỗi giờ ở phút 50 (lệch khỏi crawl :00, discovery :30, health-check :45, daily report).
SELECT cron.schedule(
  'auto-reenable-sources-hourly',
  '50 * * * *',
  $$SELECT public.auto_reenable_disabled_sources();$$
);
