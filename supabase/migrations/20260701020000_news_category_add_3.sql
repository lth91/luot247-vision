-- Mở rộng taxonomy tin trang chủ 6 → 9 mục (theo tài liệu phân loại của sếp):
-- thêm Chứng khoán, Năng lượng - Cơ sở hạ tầng (Thể thao 'the-thao' đã có sẵn
-- trong enum từ thời cũ nên chỉ no-op). Đặt RIÊNG 1 migration vì Postgres không
-- cho dùng giá trị enum vừa ADD trong cùng transaction → phải áp trước khi edge
-- function submit-news/-bulk dùng giá trị mới.
--
--   chung-khoan         → Chứng khoán
--   the-thao            → Thể thao (đã tồn tại)
--   nang-luong-ha-tang  → Năng lượng - Cơ sở hạ tầng

ALTER TYPE public.news_category ADD VALUE IF NOT EXISTS 'chung-khoan';
ALTER TYPE public.news_category ADD VALUE IF NOT EXISTS 'the-thao';
ALTER TYPE public.news_category ADD VALUE IF NOT EXISTS 'nang-luong-ha-tang';
