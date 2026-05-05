-- Manual disable 2 nguồn Phase E discover-candidates thêm hôm 2026-05-04:
--   • baothanhhoa.vn — RSS URL trả HTTP 404 (trang không tồn tại)
--   • vtv.vn        — RSS general không có tin về điện sau 6h test (0 articles)
--
-- Cả 2 đã tự auto-disable bởi crawl-electricity-news khi consecutive_failures
-- đạt threshold 10 (xem crawl-electricity-news/index.ts:556). Migration này
-- ghi đè last_error thành "manual: ..." để cron auto_reenable_disabled_sources
-- (migration 20260503020000) skip — tránh cycle vô hạn.
--
-- Cron auto-reenable chỉ flip is_active=true nếu last_error match transient
-- pattern (HTTP/timeout/aborted/network/fetch failed) AND không chứa
-- "manual" / "Edge IP" / "auto re-enabled". Format "manual disable ..." sẽ
-- bị cron bỏ qua.

UPDATE public.electricity_sources
SET last_error = 'manual disable 2026-05-05: trang web 404 (RSS URL không tồn tại)'
WHERE name = 'baothanhhoa.vn'
  AND is_active = false;

UPDATE public.electricity_sources
SET last_error = 'manual disable 2026-05-05: RSS general 0 tin về điện sau 6h test'
WHERE name = 'vtv.vn'
  AND is_active = false;
