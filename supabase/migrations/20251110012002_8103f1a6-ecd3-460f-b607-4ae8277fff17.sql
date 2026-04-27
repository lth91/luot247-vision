-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create cron job to call update-daily-stats every day at 00:05 UTC (7:05 AM GMT+7)
SELECT cron.schedule(
  'daily-update-stats',
  '5 0 * * *', -- 00:05 UTC = 7:05 AM GMT+7
  $$
  SELECT net.http_post(
    url := 'https://gklpvaindbfkcmuuuffz.supabase.co/functions/v1/update-daily-stats',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer REDACTED_LEGACY_JWT_ROTATED_2026-04-27"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);