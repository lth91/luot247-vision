-- Reactivate 5 source bị disable oan do source-cleanup bug.
--
-- Bug: source-cleanup edge function (functions/source-cleanup/index.ts line
-- 87-93) disable source nếu (is_active + 0 articles 14d + last_crawled_at
-- within 3d). Filter KHÔNG check created_at → source mới insert vài giờ
-- trước với last_crawled_at hôm nay sẽ pass tất cả conditions → disable
-- oan trong cycle đầu tiên trước khi kịp catch bài đầu tiên.
--
-- Fix code: thêm guard `s.created_at < day14` (source phải ≥14 ngày).
-- Fix data: re-enable 5 source bị disable (Phase 1B/C/D add hôm nay).
--
-- Marker "manual reactivate" để source-reenable cron không lật ngược lại.

UPDATE electricity_sources
SET is_active = true,
    consecutive_failures = 0,
    last_error = 'manual reactivate 2026-05-06: cleanup bug disable source <14d (commit fix). Marker manual để cron auto-reenable không lật.'
WHERE name IN (
  'Cafef - Tài chính quốc tế',
  'Nhà Đầu Tư - Sự kiện',
  'Một Thế Giới - Kinh tế',
  'Báo Lào Cai - Kinh tế',
  'baotintuc.vn'
)
AND is_active = false;
