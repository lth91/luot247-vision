-- Phase F — Weekly autonomy digest cron schedule.
-- Sunday 09:00 +07 = 02:00 UTC weekly. Tin to user về autonomy state.

CREATE OR REPLACE FUNCTION public.call_weekly_autonomy_digest()
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
    url := v_supabase_url || '/functions/v1/weekly-autonomy-digest',
    headers := v_headers,
    body := '{}'::jsonb,
    timeout_milliseconds := 90000
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.call_weekly_autonomy_digest() FROM anon, authenticated, public;

-- Cron Chủ Nhật 02:00 UTC (= 09:00 +07).
-- Lệch khỏi cleanup 02:30 và discover 03:00.
DO $$ BEGIN
  PERFORM cron.unschedule('weekly-autonomy-digest');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'weekly-autonomy-digest',
  '0 2 * * 0',
  $$SELECT public.call_weekly_autonomy_digest();$$
);
