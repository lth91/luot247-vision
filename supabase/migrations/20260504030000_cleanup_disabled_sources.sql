-- Cleanup 28 disabled sources từ dashboard.
-- Audit 03/05/2026: tất cả 28 disabled đều có 0 articles → safe để DELETE redundant ones.
--
-- Action breakdown:
--  • DELETE 13: redundant/dead (replaced_by_rss + site_stale + ICON-via-MacMini + 9 báo chí
--    0-articles no recovery path trong current pipeline).
--  • Re-enable + reset 4: transient errors (timeout/aborted/network) — auto-reenable cron
--    không pickup vì fails<10 (designed cho fails>=10 sau khi bumped Phase 1).
--    Manual retry, Phase 1 classifier + dedup mới có thể hỗ trợ.
--  • Leave 11 disabled: JS-rendered + edge IP block + cơ quan zero-article — đợi
--    Mac Mini Scraper extension (issue lth91/luot247-scraper#1).

-- 1. DELETE 13 redundant/dead
DELETE FROM public.electricity_sources
WHERE is_active = false
  AND name IN (
    -- Replaced by RSS feed in discovery-rss-news
    'Báo Đấu Thầu',
    'PECC3',
    -- Site stale (latest article 2022, dormant)
    'EVNGENCO2',
    -- Domain covered by Mac Mini Scraper virtual source (icon.com.vn)
    'ICON',
    -- 9 báo chí 0-articles ever, no clear recovery path with html_list pattern.
    -- User có thể re-add với config mới sau nếu thấy giá trị.
    'Báo Quảng Ninh',
    'Dân Trí - EVN',
    'Diễn đàn Doanh nghiệp',
    'Doanh nghiệp Hội nhập',
    'Mekong Asean',
    'Người Lao Động',
    'Saigon Times',
    'Thanh Niên - Ngành điện',
    'Tin Nhanh Chứng Khoán'
  )
  AND NOT EXISTS (
    -- Safety: chỉ DELETE nếu 0 articles linked (hiện đều 0, defensive).
    SELECT 1 FROM public.electricity_news n WHERE n.source_id = electricity_sources.id
  );

-- 2. Re-enable 4 transient — reset fails về 0 + clear last_error.
-- Nếu fail tiếp → consecutive_failures count up to 10 → auto-disable.
-- Nếu transient thật → auto-reenable cron 24h sau cooldown sẽ retry.
UPDATE public.electricity_sources
SET is_active = true,
    consecutive_failures = 0,
    last_error = 'manual retry 2026-05-03: was disabled at fails=5 (pre-Phase 1 threshold). Phase 1 + Phase 3 dedup deployed, retry once.'
WHERE is_active = false
  AND name IN (
    'EVN HCM',
    'EVN miền Trung (CPC)',
    'Nhiệt điện Ninh Bình'
  );

-- 3. Annotate 11 disabled còn lại với link Issue #1 cho clarity ở dashboard.
UPDATE public.electricity_sources
SET last_error = COALESCE(last_error, '') || ' [Mac Mini Scraper required: lth91/luot247-scraper#1]'
WHERE is_active = false
  AND last_error NOT LIKE '%lth91/luot247-scraper#1%'
  AND name IN (
    -- JS-rendered (9)
    'Công đoàn Điện lực', 'CTCP ĐT PT điện miền Trung', 'Điện và Đời sống',
    'EVN Hà Nội', 'EVN miền Bắc (NPC)', 'Năng lượng sạch VN',
    'PECC1', 'Tài chính EVN', 'Xây Lắp Điện',
    -- Edge IP block (1)
    'The Leader',
    -- Zero-article cơ quan, likely JS-rendered (2)
    'Cục Điện lực', 'Trung tâm dịch vụ sửa chữa EVN'
  );
