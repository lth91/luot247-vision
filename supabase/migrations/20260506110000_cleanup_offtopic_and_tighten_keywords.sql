-- Cleanup 3 bài off-topic + tighten TS keyword regex (canonical).
--
-- Bug 1: chuyendongthitruong.vn — title "Mẹ vừa gọi điện báo chuyển khoản
--        thành công 300 triệu đồng, con trai tá hỏa gọi ngay cảnh sát".
--        Filter regex match "điện" vì lookahead thiếu "báo" (idiom "gọi điện
--        báo" = call + report). Plus title-summary mismatch (summary nói về
--        giá bạc — nghi extractor pull nhầm content block; secondary bug).
--
-- Bug 2&3: theleader.vn — SHB rebrand & NovaLand stock. Static source trong
--          luot247-scraper sources.py → extractor SKIP filter (is_db_source
--          check). link_pattern dựa substring "dien" → slug Việt bỏ dấu của
--          "Diện mạo" / "diễn ra" cũng match.
--
-- Fix scraper-side (commit riêng repo luot247-scraper):
--   - Tighten Python regex (sync với TS)
--   - Bỏ is_db_source conditional → áp filter cho mọi source
DELETE FROM electricity_news
WHERE id IN (
  '958e4eb3-6cf3-4a6c-8ed8-18fb5ddf20d5', -- "Mẹ vừa gọi điện báo..."
  'ea14b9e6-eebc-4f57-b479-fd954a4be19a', -- "Diện mạo mới của SHB..."
  'e0e71c52-a120-400a-9cb2-577308f0adee'  -- "Điều gì đang diễn ra với cổ phiếu NovaLand?"
);
