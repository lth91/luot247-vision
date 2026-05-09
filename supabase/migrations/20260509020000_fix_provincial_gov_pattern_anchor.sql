-- Fix pattern anchor cho 2 nguồn add 08/05 (Báo Bắc Ninh, Bộ KHCN).
-- Bug: pattern bắt đầu bằng `^/` test fail trên absolute URL (vd
-- https://baobacninhtv.vn/abc-postid123.bbg). canonicalizeUrl() trong
-- crawl-electricity-news/extractLinks() trả absolute URL, nên `^/` không match.
-- Cả 2 nguồn fail 10× liên tiếp → tự disable.
--
-- Fix: bỏ `^` anchor, để regex match anywhere in URL (giống các nguồn khác như
-- Báo Quốc Tế). Reset consecutive_failures + re-enable is_active.

UPDATE public.electricity_sources
SET
  list_link_pattern = '/[^/]*(?:nganh-dien|dien-luc|dien-gio|dien-mat-troi|dien-hat-nhan|dien-khi|dien-than|dien-nang|dien-tai-tao|nhiet-dien|thuy-dien|xe-dien|nguon-dien|luoi-dien|gia-dien|tiet-kiem-dien|cung-ung-dien|phat-dien|tru-sac|tram-sac|san-xuat-dien|luu-tru-dien|mat-dien|cat-dien|nang-luong|nltt|nlmt|evn[a-z]*|bess|pin-luu-tru|hat-nhan|tua-bin)[^/]*-postid\d+\.bbg',
  consecutive_failures = 0,
  is_active = true,
  last_error = 'pattern fixed 2026-05-09: removed ^ anchor (was failing on absolute URLs)'
WHERE name = 'Báo Bắc Ninh - Kinh tế';

UPDATE public.electricity_sources
SET
  list_link_pattern = '/[a-z0-9-]{20,}-\d{15,}\.htm',
  consecutive_failures = 0,
  is_active = true,
  last_error = 'pattern fixed 2026-05-09: removed ^ anchor (was failing on absolute URLs)'
WHERE name = 'Bộ KHCN - Năng lượng nguyên tử';
