-- Cleanup off-topic articles slipped through keyword filter.
-- 2026-05-11: bài plo.vn "Phó Thủ tướng dự lễ động thổ ... Điện Biên Phủ"
-- match keyword "điện" do regex chưa exclude địa danh "Điện Biên".
-- Đồng thời xoá: RSS Discovery "Điện Biên điểm đến chiến lược" (5/10)
-- + 2 bài "Thương mại điện tử" lọt từ trước fix regex 5/6
-- (qdnd.vn 5/3, theleader.vn 5/1).
--
-- Regex fix: thêm Biên|Bàn vào negative lookahead
-- (_shared/electricity-keywords.ts + luot247-scraper/topic_filter.py).

DELETE FROM electricity_news
WHERE id IN (
  '0c7b146a-9f63-498f-8b04-534b1467c4f2', -- plo.vn Điện Biên Phủ
  '00bdcdf9-68f1-4295-89ba-d6fc8eaec5fa', -- RSS Discovery Điện Biên điểm đến
  '6cae19af-d89f-49bb-bd96-3a75ed36f696', -- qdnd.vn Thương mại điện tử
  '33c41f91-2593-45ad-80b8-6d6a6d5dba67'  -- theleader.vn Thương mại điện tử
);
