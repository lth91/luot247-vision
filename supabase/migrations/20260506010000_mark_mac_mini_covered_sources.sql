-- Mark 8 nguồn JS-rendered đã được Mac Mini Scraper (lth91/luot247-scraper)
-- claim trong sources.py là manual disable vĩnh viễn để Edge crawler ngừng
-- retry và auto_reenable cron không lật lại. Hàm
-- public.auto_reenable_disabled_sources() hiện skip nếu last_error chứa
-- "manual" — prefix "manual disable" trong UPDATE bên dưới đủ để protect
-- khỏi cron re-enable hourly.
--
-- Coverage verified 2026-05-04 từ electricity_news (source = "Mac Mini Scraper"):
--   icon.com.vn (62), dienvadoisong.vn (12), evnhcmc.vn (11),
--   nangluongsachvietnam.vn (7), evnhanoi.vn (4), theleader.vn (3),
--   pecc1.com.vn (3), evnfc.vn (1).
-- icon.com.vn không có row riêng trong electricity_sources nên không update.
--
-- nbtpc.com.vn (Nhiệt điện Ninh Bình) đã configured trong scraper sources.py
-- nhưng adapter chưa produce bài. Vẫn mark vì:
--   1. Edge crawler không thể fetch được (Connection reset từ IP Supabase)
--   2. consecutive_failures=10 + last_error "Connection reset" (transient)
--      → auto_reenable cron sẽ lật lại trong 24h, lặp lại fail vô ích.
-- Khi Playwright adapter fix xong, scraper Mac Mini sẽ produce vào virtual
-- source "Mac Mini Scraper" thay vì row gốc này.
--
-- EVN HCM là case quan trọng nhất: vừa hard-fail "signal aborted" × 10 ngày
-- 03/05, last_error transient → không có migration này thì sẽ bị
-- auto_reenable_disabled_sources lật lại sau cooldown 24h và lặp lại fail.

UPDATE public.electricity_sources
SET
  is_active = false,
  consecutive_failures = 0,
  last_error = 'manual disable 2026-05-04: handled by Mac Mini Scraper (lth91/luot247-scraper). Edge crawler skip để khỏi lãng phí time budget; auto_reenable cron skip do match keyword "manual".',
  disabled_at = COALESCE(disabled_at, now())
WHERE name IN (
  'Điện và Đời sống',
  'EVN Hà Nội',
  'EVN HCM',
  'Năng lượng sạch VN',
  'PECC1',
  'Tài chính EVN',
  'The Leader'
);

UPDATE public.electricity_sources
SET
  is_active = false,
  consecutive_failures = 0,
  last_error = 'manual disable 2026-05-04: claimed by Mac Mini Scraper sources.py (lth91/luot247-scraper) — adapter đã configured nhưng chưa produce bài, debug pending. Edge crawler skip để khỏi lãng phí time budget.',
  disabled_at = COALESCE(disabled_at, now())
WHERE name = 'Nhiệt điện Ninh Bình';
