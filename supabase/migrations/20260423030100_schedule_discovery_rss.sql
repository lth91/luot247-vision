-- Schedule hourly call tới edge function discovery-rss-news.
-- Chạy ở phút thứ 30 mỗi giờ (lệch 30 phút với crawl-electricity-news chạy phút 0)
-- để tách tải và giảm burst rate limit Anthropic.

CREATE OR REPLACE FUNCTION public.call_discovery_rss_news()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_supabase_url text := 'https://gklpvaindbfkcmuuuffz.supabase.co';
  v_service_role_key text;
  v_headers jsonb;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_service_role_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key';
  EXCEPTION
    WHEN OTHERS THEN
      v_service_role_key := NULL;
  END;

  IF v_service_role_key IS NULL THEN
    v_service_role_key := 'REDACTED_LEGACY_JWT_ROTATED_2026-04-27';
  END IF;

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_service_role_key,
    'apikey', v_service_role_key
  );

  PERFORM net.http_post(
    url := v_supabase_url || '/functions/v1/discovery-rss-news',
    headers := v_headers,
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('discovery-rss-news-hourly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'discovery-rss-news-hourly',
  '30 * * * *',
  $$SELECT public.call_discovery_rss_news();$$
);
