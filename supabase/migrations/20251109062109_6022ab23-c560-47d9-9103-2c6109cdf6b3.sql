-- Enable pg_cron extension for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule daily stats update at 7 AM GMT+7 (0 AM UTC)
-- This will run every day at midnight UTC (7 AM Vietnam time)
SELECT cron.schedule(
  'update-daily-view-stats',
  '0 0 * * *', -- Run at 0:00 UTC daily
  $$
  SELECT
    net.http_post(
        url:='https://gklpvaindbfkcmuuuffz.supabase.co/functions/v1/update-daily-stats',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer REDACTED_LEGACY_JWT_ROTATED_2026-04-27"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);