-- Helper function gọi edge function backfill-summaries qua pg_net.
-- Dùng: SELECT public.call_backfill_summaries(20, 3);

CREATE OR REPLACE FUNCTION public.call_backfill_summaries(p_limit int DEFAULT 30, p_days int DEFAULT 3)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_supabase_url text := 'https://gklpvaindbfkcmuuuffz.supabase.co';
  v_service_role_key text;
  v_headers jsonb;
  v_request_id bigint;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_service_role_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key';
  EXCEPTION
    WHEN OTHERS THEN v_service_role_key := NULL;
  END;

  IF v_service_role_key IS NULL THEN
    v_service_role_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrbHB2YWluZGJma2NtdXV1ZmZ6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTAzMjA3NCwiZXhwIjoyMDc2NjA4MDc0fQ.2Hye6gnC9ZVVUrD48LvTLpLo-LgDuebbl7CAaqu0rZo';
  END IF;

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_service_role_key,
    'apikey', v_service_role_key
  );

  SELECT net.http_post(
    url := v_supabase_url || '/functions/v1/backfill-summaries',
    headers := v_headers,
    body := jsonb_build_object('limit', p_limit, 'days', p_days),
    timeout_milliseconds := 180000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;
