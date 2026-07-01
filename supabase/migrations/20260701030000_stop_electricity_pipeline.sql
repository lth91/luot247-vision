-- Gỡ vertical điện: tắt TẤT CẢ cron của pipeline điện (idempotent — no-op nếu
-- đã tắt). Tin năng lượng/điện từ giờ vào feed chung qua submit-news (mục
-- 'nang-luong-ha-tang'). KHÔNG xoá bảng electricity_news/electricity_sources
-- (giữ dữ liệu cũ). Edge function điện gỡ khỏi repo ở cùng PR (bản deploy cũ
-- nằm im, không cron nào gọi).

DO $$
DECLARE j text;
BEGIN
  FOREACH j IN ARRAY ARRAY[
    'crawl-electricity-news-hourly',
    'crawl-electricity-news-15min',
    'discovery-rss-news-hourly',
    'discover-candidates-daily',
    'auto-fix-selector-daily',
    'pending-playwright-lifecycle',
    'pipeline-health-check-6h',
    'autonomy-digest-daily',
    'weekly-autonomy-digest',
    'source-cleanup-daily',
    'auto-reenable-sources-hourly',
    'dedup-electricity-news-6h'
  ] LOOP
    BEGIN PERFORM cron.unschedule(j); EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;
END $$;
