-- Cleanup 2 bài off-topic lọt qua keyword filter sáng 25/5.
--   1. doisongphapluat.com.vn "Con lạng lách, đánh võng bằng xe máy điện,
--      3 phụ huynh bị phạt nặng" — title match "xe điện" trong regex (xe
--      scooter trẻ em vi phạm giao thông). Bonus bug: extractor pull nhầm
--      content block — summary nói về vụ nhảy lầu bệnh viện Quảng Nam
--      (separate parser issue trong luot247-scraper repo).
--   2. evnhanoi.vn "Vì sức khỏe người lao động EVNHANOI" — title match
--      "EVN" trong regex, nhưng nội dung là campaign HR/wellness nội bộ.
--
-- Code fix paired (cùng commit): thêm OFF_TOPIC_TITLE_RE +
-- isOffTopicTitle() trong _shared/electricity-keywords.ts, áp dụng pre-LLM
-- ở crawl-electricity-news + discovery-rss-news. Mirror cần update trong
-- luot247-scraper/topic_filter.py.

DELETE FROM public.electricity_news WHERE id IN (
  'c131cfb2-9c9a-400e-9db5-b8b8d5d70370', -- doisongphapluat: lạng lách xe máy điện
  '57c7ba75-908d-4a35-9b54-67af8f20be53'  -- evnhanoi: vì sức khỏe người lao động
);
