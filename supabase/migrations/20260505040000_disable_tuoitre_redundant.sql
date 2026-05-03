-- Disable Tuổi Trẻ per-source crawler.
-- Audit 03/05/2026: list page tuoitre.vn/kinh-te.htm trả tin general không match
-- regex keyword điện. Tag pages /tag/nganh-dien.htm, /tag/dien.htm bị JS-render
-- (trả full homepage content thay vì tag-specific). list_url không recoverable
-- qua simple html_list crawl.
--
-- Tin Tuổi Trẻ về điện đã được cover qua RSS Discovery via 2 feeds đang active:
--   tuoitre.vn/rss/kinh-doanh.rss
--   tuoitre.vn/rss/thoi-su.rss
-- → per-source entry là duplicate effort. 28 bài lịch sử giữ nguyên.

UPDATE public.electricity_sources
SET is_active = false,
    last_error = 'manual disable 2026-05-03: list page redesigned, RSS Discovery covers via tuoitre.vn/rss/kinh-doanh.rss + thoi-su.rss'
WHERE name = 'Tuổi Trẻ' AND is_active = true;
