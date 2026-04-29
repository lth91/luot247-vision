-- Schedule edge function health-check?report=1 chạy 3 lần/ngày.
-- Sáng 8h, trưa 14h, tối 20h VN (UTC+7) = UTC 1h, 7h, 13h.

CREATE OR REPLACE FUNCTION public.call_daily_report()
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
    RAISE EXCEPTION 'service_role_key vault secret missing';
  END IF;

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_service_role_key,
    'apikey', v_service_role_key
  );

  PERFORM net.http_post(
    url := v_supabase_url || '/functions/v1/health-check?report=1',
    headers := v_headers,
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('luot247-daily-report');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 3 lần/ngày: 1:00 UTC (8h VN), 7:00 UTC (14h VN), 13:00 UTC (20h VN)
SELECT cron.schedule(
  'luot247-daily-report',
  '0 1,7,13 * * *',
  $$SELECT public.call_daily_report();$$
);
