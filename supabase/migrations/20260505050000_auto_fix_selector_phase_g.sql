-- Phase G — AI auto-fix selector agent.
--
-- Khi source Tier 1/2 có consecutive_failures ≥ 3 + last_error chứa
-- 'no candidates parsed' (selector vỡ do site redesign) → cron 04:00 UTC
-- chạy AI agent: fetch list_url, gửi sample link cho Claude Haiku, đề xuất
-- regex pattern mới, test, apply nếu ≥5 link match.

-- 1. Audit table cho mỗi auto-fix attempt
CREATE TABLE IF NOT EXISTS public.selector_fix_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid REFERENCES public.electricity_sources(id) ON DELETE CASCADE,
  source_name text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  old_pattern text,
  new_pattern text,
  llm_confidence numeric,
  llm_reason text,
  test_match_count int,  -- số link match pattern mới khi test
  applied boolean NOT NULL DEFAULT false,
  result text  -- 'applied' | 'rejected_low_confidence' | 'rejected_no_match' | 'rejected_llm_fail' | 'rejected_fetch_fail'
);

CREATE INDEX IF NOT EXISTS idx_selector_fix_log_at
  ON public.selector_fix_log (attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_selector_fix_log_source
  ON public.selector_fix_log (source_id, attempted_at DESC);

ALTER TABLE public.selector_fix_log ENABLE ROW LEVEL SECURITY;

-- 2. RPC vault pattern
CREATE OR REPLACE FUNCTION public.call_auto_fix_selector()
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
    url := v_supabase_url || '/functions/v1/auto-fix-selector',
    headers := v_headers,
    body := '{}'::jsonb,
    timeout_milliseconds := 90000
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.call_auto_fix_selector() FROM anon, authenticated, public;

-- 3. Cron 04:00 UTC daily (sau cleanup 02:30 + discover 03:00)
DO $$ BEGIN
  PERFORM cron.unschedule('auto-fix-selector-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'auto-fix-selector-daily',
  '0 4 * * *',
  $$SELECT public.call_auto_fix_selector();$$
);
