-- Xoá 4 bài Playwright source lệch chủ đề lọt qua topic filter v1.
--
-- Cron 9:20 VN ngày 5/5 — sau khi áp filter v1 (luot247-scraper 01aad2f),
-- 4/6 bài insert vẫn lệch chủ đề:
--   • IIP tháng 4 tăng 9,9% — match content "phân phối điện 10,9%"
--   • Bức tranh kinh tế VN 4 tháng — match content "sản xuất điện 7,5%"
--   • Bộ Công Thương góp ý nghị định viên chức — match keyword "Bộ Công Thương"
--   • Tô Lâm thăm Sri Lanka — match từ ghép lệch trong content
--
-- Filter v2 (luot247-scraper 5f8892e) đã siết:
--   • Chỉ check TITLE (không content)
--   • Drop "Bộ Công Thương" (broad: commerce/HR/industry)
--   • Drop "năng lượng" (broad: oil/gas/coal/RE)
--   • Thêm exclusion "điện đàm/văn/tín" trong negative lookahead
--
-- Migration này dọn 4 bài lỡ insert; cycle sau filter v2 sẽ chặn tại extractor.

DELETE FROM public.electricity_news
WHERE id::text = ANY (ARRAY[
  '332c6550-dd2f-405d-912d-e278f56b8714',
  '620e4b95-5322-4bb2-b410-cef92141e3c7',
  'ad7e5b4d-760b-46f3-a320-3e0d26ef0b63',
  '45fe34a2-a4dc-49ae-aefc-4437d62d10cf'
]);
