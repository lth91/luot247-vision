-- Pipeline health check — cron mỗi 6h gọi edge function pipeline-health-check.
-- Function gửi Telegram alert nếu có issue (silence = healthy).
--
-- Cron lúc 15, 21, 03, 09 UTC = 22, 04, 10, 16 +07. Lệch khỏi
-- daily-auto-views (mỗi 30'), digest 02:00, discover 03:00, auto-fix 04:00,
-- lifecycle-pending 05:00 — và lệch khỏi 00 phút để không pile up với crawler.

-- RPC helper: get_last_cron_run — pipeline-health-check dùng để check digest cron alive
CREATE OR REPLACE FUNCTION public.get_last_cron_run(jobname_in text)
RETURNS TABLE(last_run timestamptz, status text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'cron'
AS $$
  SELECT start_time AS last_run, status
  FROM cron.job_run_details d
  JOIN cron.job j ON j.jobid = d.jobid
  WHERE j.jobname = jobname_in
  ORDER BY start_time DESC
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.get_last_cron_run(text) FROM anon, authenticated, public;

-- RPC để cron call edge function (vault pattern)
CREATE OR REPLACE FUNCTION public.call_pipeline_health_check()
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
    url := v_supabase_url || '/functions/v1/pipeline-health-check',
    headers := v_headers,
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.call_pipeline_health_check() FROM anon, authenticated, public;

DO $$ BEGIN
  PERFORM cron.unschedule('pipeline-health-check-6h');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Cron chạy phút 15 các giờ 03, 09, 15, 21 UTC = 04:15, 10:15, 16:15, 22:15 +07
SELECT cron.schedule(
  'pipeline-health-check-6h',
  '15 3,9,15,21 * * *',
  $$SELECT public.call_pipeline_health_check();$$
);
