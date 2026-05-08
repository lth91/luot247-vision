-- Schedule báo cáo cost API mỗi 6h qua Telegram (mode 6h-report).
-- 4 lần/ngày: 06:35, 12:35, 18:35, 00:35 VN = UTC 23:35, 05:35, 11:35, 17:35.
-- Phút 35 lệch khỏi 0/5/15/25 (crawler, daily-report, pipeline-health, hourly-check).

DO $$ BEGIN
  PERFORM cron.unschedule('llm-cost-6h-report');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'llm-cost-6h-report',
  '35 5,11,17,23 * * *',
  $cron$SELECT public.call_api_cost_report('6h-report');$cron$
);
