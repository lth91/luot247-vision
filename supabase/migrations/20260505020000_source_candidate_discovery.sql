-- Phase E — Auto-discovery candidate sources via Google News RSS.
--
-- Mỗi 03:00 UTC daily: edge function discover-candidates chạy 5 Google News
-- queries → group by domain → probe top 5 candidates → auto-INSERT max 3/day
-- nếu RSS available. Log mọi candidate vào source_candidate_log cho audit.

-- 1. Bảng candidate log
CREATE TABLE IF NOT EXISTS public.source_candidate_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  sample_titles jsonb,
  sample_count int NOT NULL DEFAULT 0,
  status text NOT NULL
    CHECK (status IN ('added', 'rejected_existing', 'rejected_probe_fail',
                      'rejected_low_count', 'rejected_anti_bot', 'rejected_no_rss',
                      'rejected_daily_limit')),
  decision_reason text,
  query_seed text,
  inserted_source_id uuid  -- nullable, link tới row mới INSERT (nếu added)
);

CREATE INDEX IF NOT EXISTS idx_source_candidate_log_at
  ON public.source_candidate_log (discovered_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_candidate_log_domain
  ON public.source_candidate_log (domain, discovered_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_candidate_log_status
  ON public.source_candidate_log (status, discovered_at DESC);

ALTER TABLE public.source_candidate_log ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.source_candidate_log IS
  'Audit mỗi candidate domain Phase E discover xét. status reflect decision.';

-- 2. RPC để cron call edge function (vault pattern)
CREATE OR REPLACE FUNCTION public.call_discover_candidates()
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
    url := v_supabase_url || '/functions/v1/discover-candidates',
    headers := v_headers,
    body := '{}'::jsonb,
    timeout_milliseconds := 90000
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.call_discover_candidates() FROM anon, authenticated, public;

-- 3. Schedule cron 03:00 UTC daily (sau source-cleanup 02:30)
DO $$ BEGIN
  PERFORM cron.unschedule('discover-candidates-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'discover-candidates-daily',
  '0 3 * * *',
  $$SELECT public.call_discover_candidates();$$
);
