-- Dọn alert Telegram cũ của pipeline điện đã tắt (22/07).
-- Migration 20260701030000 tắt 12 cron nhưng SÓT 2 job vẫn gọi edge function
-- health-check (bản điện, đọc electricity_sources/electricity_news):
--   - luot247-daily-report (8h/14h/20h VN): "Báo cáo... Số nguồn đang tạm dừng: 95..."
--     → chính là tin ma 08:00 mỗi sáng trên luot247_alert_bot.
--   - health-check-4h: bản alert im-lặng-khi-khỏe của cùng function.
-- Kèm theo: tắt llm-cost-6h-report (4 tin cost/ngày — thừa, đã có báo cáo
-- 08:05 hằng ngày + Bản tin sáng). GIỮ llm-cost-daily-report (08:05, chi tiết
-- per-function) và llm-cost-hourly-check (im lặng, chỉ kêu khi >$1/giờ).

DO $$
DECLARE j text;
BEGIN
  FOREACH j IN ARRAY ARRAY[
    'luot247-daily-report',
    'health-check-4h',
    'llm-cost-6h-report'
  ] LOOP
    BEGIN PERFORM cron.unschedule(j); EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;
END $$;

-- Helper SQL của 2 job điện — không còn ai gọi.
DROP FUNCTION IF EXISTS public.call_daily_report();
DROP FUNCTION IF EXISTS public.call_health_check();
-- call_api_cost_report(text) GIỮ NGUYÊN — daily + hourly-check còn dùng.
