-- Đổi cron schedule crawl-electricity-news từ mỗi giờ sang mỗi 15 phút.
-- Xoá job cũ "crawl-electricity-news-hourly" và tạo mới với tên rõ ràng hơn.

DO $$
BEGIN
  PERFORM cron.unschedule('crawl-electricity-news-hourly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('crawl-electricity-news-15min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'crawl-electricity-news-15min',
  '*/15 * * * *',
  $$SELECT public.call_crawl_electricity_news();$$
);
