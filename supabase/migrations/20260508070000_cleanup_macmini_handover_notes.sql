-- Cleanup last_error notes cho 9 source đã disable handover sang Mac Mini.
-- 2 đợt:
--   1) 3 source removed khỏi sources.py từ 04-28/29 nhưng note "handled by Mac Mini" còn → dashboard
--      false-positive đếm là "claimed nhưng chưa produce".
--   2) 6 source vừa remove khỏi sources.py 2026-05-08 (zero/low yield 30d).
-- Strip "Mac Mini Scraper" để dashboard ngừng đếm vào pending list.

UPDATE public.electricity_sources
SET last_error = 'manual disable 2026-05-04: removed from Mac Mini sources.py 2026-05-08 (low yield / structure issues), no longer claimed by any crawler.'
WHERE base_url IN (
  'https://xaylapdien.net',
  'https://eav.gov.vn',
  'https://evnpsc.com.vn'
);

UPDATE public.electricity_sources
SET last_error = 'manual disable 2026-05-04 + removed from Mac Mini sources.py 2026-05-08: zero/low yield 30d.'
WHERE base_url IN (
  'https://npc.com.vn',
  'https://nbtpc.com.vn',
  'https://www.congdoandlvn.org.vn',
  'https://mientrungpid.com.vn',
  'https://www.pecc1.com.vn',
  'https://www.evnfc.vn'
);
