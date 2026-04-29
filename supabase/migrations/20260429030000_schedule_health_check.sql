-- Schedule edge function health-check chạy mỗi 4 giờ.
-- Function gửi Telegram alert nếu insert <5 bài/6h hoặc cron failed >=2 lần.

CREATE OR REPLACE FUNCTION public.call_health_check()
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
    url := v_supabase_url || '/functions/v1/health-check',
    headers := v_headers,
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('health-check-4h');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Cron mỗi 4 giờ ở phút 45 (lệch khỏi crawl phút 0 và discovery phút 30)
SELECT cron.schedule(
  'health-check-4h',
  '45 */4 * * *',
  $$SELECT public.call_health_check();$$
);
