-- Track LLM API usage cho việc kiểm soát cost.
-- Mỗi call Anthropic insert 1 row vào llm_usage_log.
-- Edge function api-cost-report sẽ aggregate và push Telegram.

CREATE TABLE IF NOT EXISTS public.llm_usage_log (
  id BIGSERIAL PRIMARY KEY,
  function_name TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_creation_input_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_input_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_llm_usage_log_created_at
  ON public.llm_usage_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_usage_log_function_created
  ON public.llm_usage_log (function_name, created_at DESC);

ALTER TABLE public.llm_usage_log ENABLE ROW LEVEL SECURITY;

-- Chỉ service role được insert/select. Không expose cho anon/authenticated.
DROP POLICY IF EXISTS "service_role_all" ON public.llm_usage_log;
CREATE POLICY "service_role_all" ON public.llm_usage_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- RPC để cron call api-cost-report (vault pattern, giống call_pipeline_health_check).
CREATE OR REPLACE FUNCTION public.call_api_cost_report(mode_in text)
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
  EXCEPTION WHEN OTHERS THEN
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
    url := v_supabase_url || '/functions/v1/api-cost-report?mode=' || mode_in,
    headers := v_headers,
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.call_api_cost_report(text) FROM anon, authenticated, public;

-- Daily report 8:05 VN = 01:05 UTC (lệch 0 phút + lệch khỏi luot247-daily-report 1:00).
DO $$ BEGIN
  PERFORM cron.unschedule('llm-cost-daily-report');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'llm-cost-daily-report',
  '5 1 * * *',
  $$SELECT public.call_api_cost_report('daily');$$
);

-- Hourly threshold check phút 25 (lệch khỏi crawler 0 phút, daily-report 1:00, pipeline-health 15 phút).
DO $$ BEGIN
  PERFORM cron.unschedule('llm-cost-hourly-check');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'llm-cost-hourly-check',
  '25 * * * *',
  $$SELECT public.call_api_cost_report('hourly-check');$$
);
