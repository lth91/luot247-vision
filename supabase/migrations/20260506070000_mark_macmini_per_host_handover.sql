-- Mark thêm 8 sources đã thực sự được Mac Mini scrape via per-host naming
-- ("Mac Mini (host.tld)") là handover. Audit 2026-05-04: scraper version
-- mới insert bài với source_name="Mac Mini (host.tld)" thay vì "Mac Mini
-- Scraper" flat → row gốc trong electricity_sources không nhận bài, vẫn
-- ở trạng thái cũ (cf=10 / hard-fail). Cần mark để dashboard banner ngừng
-- false alarm.
--
-- 8 sources:
--   - EVN miền Trung (CPC) — đã có 8 bài Mac Mini hôm nay
--   - 7 sources khác (NPC, Công đoàn ĐL, mientrungpid, Cục Điện lực,
--     evnpsc, Xây Lắp Điện, nbtpc) — claimed trong sources.py, scraper
--     đang test, chưa produce bài.

UPDATE public.electricity_sources
SET
  is_active = false,
  consecutive_failures = 0,
  pending_review = false,
  last_error = 'manual disable 2026-05-04: handled by Mac Mini Scraper (lth91/luot247-scraper sources.py). Mac Mini scrape qua "Mac Mini (host)" naming, insert vào virtual source row.'
WHERE name IN (
  'EVN miền Trung (CPC)',
  'Nhiệt điện Ninh Bình',
  'EVN miền Bắc (NPC)',
  'Công đoàn Điện lực',
  'CTCP ĐT PT điện miền Trung',
  'Cục Điện lực',
  'Trung tâm dịch vụ sửa chữa EVN',
  'Xây Lắp Điện'
);
