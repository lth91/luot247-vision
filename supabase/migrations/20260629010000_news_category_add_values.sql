-- Taxonomy 5 mục cho tin do USER gửi (pipeline submit-news).
-- Thêm 4 enum value mới vào news_category; 'the-gioi' đã tồn tại nên tái dùng.
-- Đặt RIÊNG 1 migration vì Postgres không cho dùng giá trị enum vừa ADD trong
-- cùng transaction → file này phải commit trước các migration/edge dùng giá trị.
--
-- Slug ↔ nhãn (xem _shared/news-categories.ts):
--   kinh-te-dau-tu        → Kinh tế, đầu tư, kinh doanh
--   chinh-sach-phap-luat  → Chính sách, pháp luật kinh doanh
--   xa-hoi-van-hoa        → Xã hội, văn hóa, đời sống
--   an-ninh-trat-tu       → An ninh, trật tự
--   the-gioi              → Thế giới (đã có sẵn)

ALTER TYPE public.news_category ADD VALUE IF NOT EXISTS 'kinh-te-dau-tu';
ALTER TYPE public.news_category ADD VALUE IF NOT EXISTS 'chinh-sach-phap-luat';
ALTER TYPE public.news_category ADD VALUE IF NOT EXISTS 'xa-hoi-van-hoa';
ALTER TYPE public.news_category ADD VALUE IF NOT EXISTS 'an-ninh-trat-tu';
