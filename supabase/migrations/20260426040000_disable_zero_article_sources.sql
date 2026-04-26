-- P1: Disable 12 nguồn không scrape được
-- Audit ngày 26/04/2026: các site này đều render JS hoặc không có nội dung mới trong 3 ngày,
-- crawl-electricity-news (fetch + regex) không thể trích xuất link bài.
-- Để bật lại cần Playwright hoặc nguồn RSS thay thế.

UPDATE public.electricity_sources
SET is_active = false,
    last_error = 'JS-rendered, no link extractable via fetch (audit 26/04)'
WHERE name IN (
  'EVN miền Bắc (NPC)',         -- npc.com.vn: Adobe AEM JS hydration
  'EVN Hà Nội',                  -- evnhanoi.vn: JS render
  'Tài chính EVN',               -- evnfc.vn: JS render
  'Công đoàn Điện lực',          -- congdoandlvn.org.vn: JS render, RSS 403
  'PECC1',                       -- pecc1.com.vn: JS render
  'Xây Lắp Điện',                -- xaylapdien.net: JS render
  'Điện và Đời sống',            -- dienvadoisong.vn: JS render, RSS empty
  'Năng lượng sạch VN',          -- nangluongsachvietnam.vn: DotNetNuke JS
  'CTCP ĐT PT điện miền Trung'   -- mientrungpid.com.vn: JS render
);

-- EVNGENCO2: site hoạt động, link extractable, NHƯNG tin mới nhất từ 2022 — không có bài trong 3 ngày
UPDATE public.electricity_sources
SET is_active = false,
    last_error = 'site stale: latest article 2022, falls outside 3-day window'
WHERE name = 'EVNGENCO2';

-- PECC3: được phục vụ qua RSS feed thêm vào discovery-rss-news (https://www.pecc3.com.vn/feed),
-- entry html_list cũ không cần thiết
UPDATE public.electricity_sources
SET is_active = false,
    last_error = 'replaced by RSS feed in discovery-rss-news'
WHERE name = 'PECC3';

-- Báo Đấu Thầu: dùng RSS thay HTML scrape
UPDATE public.electricity_sources
SET is_active = false,
    last_error = 'replaced by RSS feed (baodauthau.vn/rss/nang-luong) in discovery-rss-news'
WHERE name = 'Báo Đấu Thầu';
