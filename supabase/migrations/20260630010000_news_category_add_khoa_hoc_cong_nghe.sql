-- Thêm chuyên mục thứ 6 cho tin do USER gửi: Khoa học - Công nghệ.
-- Đặt RIÊNG 1 migration vì Postgres không cho dùng giá trị enum vừa ADD trong
-- cùng transaction → file này phải commit/áp trước khi edge function dùng giá trị.
--
--   khoa-hoc-cong-nghe → Khoa học, công nghệ
-- (xem _shared/news-categories.ts cho nhãn + quy tắc phân loại)

ALTER TYPE public.news_category ADD VALUE IF NOT EXISTS 'khoa-hoc-cong-nghe';
