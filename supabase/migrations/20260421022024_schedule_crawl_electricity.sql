-- Schedule hourly call tới edge function crawl-electricity-news.
-- Pattern tương tự schedule_daily_auto_views.

CREATE OR REPLACE FUNCTION public.call_crawl_electricity_news()
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
    -- Fallback: dùng cùng service role key như daily-auto-views
    v_service_role_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrbHB2YWluZGJma2NtdXV1ZmZ6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTAzMjA3NCwiZXhwIjoyMDc2NjA4MDc0fQ.2Hye6gnC9ZVVUrD48LvTLpLo-LgDuebbl7CAaqu0rZo';
  END IF;

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_service_role_key,
    'apikey', v_service_role_key
  );

  PERFORM net.http_post(
    url := v_supabase_url || '/functions/v1/crawl-electricity-news',
    headers := v_headers,
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
END;
$$;

-- Bật pg_cron và pg_net nếu chưa có
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Huỷ job cũ cùng tên (nếu có) trước khi tạo mới
DO $$
BEGIN
  PERFORM cron.unschedule('crawl-electricity-news-hourly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'crawl-electricity-news-hourly',
  '0 * * * *',
  $$SELECT public.call_crawl_electricity_news();$$
);
