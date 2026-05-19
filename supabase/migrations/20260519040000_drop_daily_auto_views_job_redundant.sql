-- Cleanup tiếp theo sau migration 20260519030000:
-- daily-auto-views-job (schedule '0 0 * * *') gọi cùng edge function URL
-- với auto-views-every-30min (schedule '*/30 * * * *' fire tại minute 0
-- mỗi giờ, bao gồm 00:00 UTC = 7AM GMT+7). Hoàn toàn redundant.
--
-- Giữ lại reset-daily-view-stats2 ('0 0 * * *' direct SQL call) làm
-- safety net: auto-views-every-30min chỉ trigger reset khi
-- (currentHour === 7 && currentMinute < 30). Nếu 00:00 UTC fire fail,
-- 00:30 UTC fire sẽ skip reset (minute=30 không < 30) → cả ngày không
-- reset → yesterday/today bị stuck.

SELECT cron.unschedule('daily-auto-views-job');
