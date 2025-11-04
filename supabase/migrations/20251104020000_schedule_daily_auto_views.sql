-- Schedule cron job to call daily-auto-views edge function every 30 minutes
-- This will automatically add views distributed throughout the day (7 AM - 10 PM GMT+7)
-- Edge function will automatically skip if outside 7 AM - 10 PM hours

-- Function to call the daily-auto-views edge function via HTTP
-- Note: Service role key needs to be set in Supabase Dashboard > Database > Settings > Custom GUCs
-- Or can be retrieved from vault secrets
CREATE OR REPLACE FUNCTION public.call_daily_auto_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_response_id bigint;
  v_supabase_url text := 'https://gklpvaindbfkcmuuuffz.supabase.co';
  v_service_role_key text;
  v_headers jsonb;
BEGIN
  -- Get service role key
  -- Option 1: Try to get from vault (if available)
  BEGIN
    SELECT decrypted_secret INTO v_service_role_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key';
  EXCEPTION
    WHEN OTHERS THEN
      v_service_role_key := NULL;
  END;
  
  -- Option 2: Hardcode service role key here
  -- Copy SUPABASE_SERVICE_ROLE_KEY from Edge Function Secrets and paste below:
  -- IMPORTANT: Replace 'YOUR_SERVICE_ROLE_KEY_HERE' with your actual key
  IF v_service_role_key IS NULL THEN
    -- Paste your service role key here (from Edge Function Secrets > SUPABASE_SERVICE_ROLE_KEY)
    v_service_role_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrbHB2YWluZGJma2NtdXV1ZmZ6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTAzMjA3NCwiZXhwIjoyMDc2NjA4MDc0fQ.2Hye6gnC9ZVVUrD48LvTLpLo-LgDuebbl7CAaqu0rZo';
  END IF;
  
  -- Build headers with or without auth
  IF v_service_role_key IS NOT NULL THEN
    v_headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_role_key,
      'apikey', v_service_role_key
    );
  ELSE
    -- Without service role key, edge function might reject the request
    -- You'll need to configure authentication in Supabase Dashboard
    v_headers := jsonb_build_object(
      'Content-Type', 'application/json'
    );
  END IF;
  
  -- Call edge function via HTTP using pg_net
  SELECT net.http_post(
    url := v_supabase_url || '/functions/v1/daily-auto-views',
    headers := v_headers,
    body := '{}'::jsonb
  ) INTO v_response_id;
  
  RAISE NOTICE 'Called daily-auto-views edge function at %, request ID: %', now(), v_response_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to call daily-auto-views: %', SQLERRM;
END;
$$;

-- Schedule cron job to run every 30 minutes
-- Edge function will:
-- 1. Check if current time is between 7 AM - 10 PM (GMT+7)
-- 2. If yes, calculate views to add for current 30-minute interval
-- 3. Add views to view_logs2 with timestamps distributed in that interval
-- 4. If outside hours, skip automatically
SELECT cron.schedule(
  'call-daily-auto-views',
  '*/30 * * * *', -- Every 30 minutes
  $$
  SELECT public.call_daily_auto_views();
  $$
);

-- Note: 
-- 1. Service role key needs to be configured for authentication
-- 2. Can be set via Supabase Dashboard > Database > Settings > Custom GUCs
-- 3. Or use Supabase Vault to store the secret securely
-- 4. Edge function will automatically skip if outside 7 AM - 10 PM (GMT+7)

