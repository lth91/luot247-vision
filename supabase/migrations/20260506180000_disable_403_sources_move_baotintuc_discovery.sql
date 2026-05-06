-- Disable 3 source không phù hợp với edge crawler:
--
-- 1. Nhà Đầu Tư - Sự kiện (HTTP 403): site block edge function User-Agent.
--    Cần residential proxy ($50-150/mo) hoặc Mac Mini Playwright handover.
--    Defer Phase 2 — đợi Phase E auto-discover qua Discovery feed (nhadautu
--    bài #23 đã catch qua Discovery → có path).
--
-- 2. Một Thế Giới - Kinh tế (HTTP 403): same.
--
-- 3. baotintuc.vn (filter reject all): /tin-moi-nhat.rss top items không có
--    "điện" → keyword filter reject hết. Đã add vào Discovery FEEDS
--    (BaoTinTuc - Tin mới + Thế giới) — Discovery dùng LLM classifier
--    lenient hơn, sẽ catch bài an ninh năng lượng / điện khí khi xuất hiện.

UPDATE electricity_sources
SET is_active = false,
    consecutive_failures = 0,
    last_error = 'manual disable 2026-05-06: HTTP 403 anti-bot từ edge function. Cần residential proxy hoặc Phase E Playwright handover. Phase 2 defer.'
WHERE name IN ('Nhà Đầu Tư - Sự kiện', 'Một Thế Giới - Kinh tế');

UPDATE electricity_sources
SET is_active = false,
    consecutive_failures = 0,
    last_error = 'manual disable 2026-05-06: tier-3 RSS general bị keyword filter reject hết (top items không có "điện"). Moved to Discovery FEEDS (BaoTinTuc - Tin mới + Thế giới) cho LLM classifier xử lý.'
WHERE name = 'baotintuc.vn';
