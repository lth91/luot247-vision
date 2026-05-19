-- Xóa cron call-daily-auto-views trùng với auto-views-every-30min.
-- Cả 2 cùng schedule '*/30 * * * *' cùng gọi edge function daily-auto-views.
-- Trong 24h verify (cron.job_run_details): cả 2 đều succeeded 48 lần → mỗi
-- khoảng 30 phút edge function bị trigger 2 lần → views thực tế ×2.
--
-- Kết hợp với bug formula trong index.ts (weightedViews × 14/30 = 0.467)
-- vô tình cân bằng ~50% output → tổng day ~1280 (gần target 1000-1500).
--
-- Sau khi fix formula (đúng dailyTarget) + xóa cron trùng, output 1 cron
-- sẽ exactly dailyTarget = 2000-3000/day.

SELECT cron.unschedule('call-daily-auto-views');

-- Drop wrapper function không còn được dùng (tránh ai gọi nhầm)
DROP FUNCTION IF EXISTS public.call_daily_auto_views();
