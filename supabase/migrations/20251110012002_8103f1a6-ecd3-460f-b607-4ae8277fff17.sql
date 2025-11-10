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
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrbHB2YWluZGJma2NtdXV1ZmZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEwMzIwNzQsImV4cCI6MjA3NjYwODA3NH0.2OhNA8m21dGgc29_ocKwDsb9yerwDadYsnKlWyyvzuI"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);