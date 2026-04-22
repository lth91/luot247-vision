-- Đổi cron schedule crawl-electricity-news từ mỗi 15 phút về mỗi giờ để giảm chi phí API Claude.

DO $$
BEGIN
  PERFORM cron.unschedule('crawl-electricity-news-15min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('crawl-electricity-news-hourly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'crawl-electricity-news-hourly',
  '0 * * * *',
  $$SELECT public.call_crawl_electricity_news();$$
);
