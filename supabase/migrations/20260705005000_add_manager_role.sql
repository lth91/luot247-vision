-- Thêm role 'manager' vào enum app_role — quyền Quản lý đóng góp (vào
-- /quan-ly-dong-gop: phủ quyết thẻ, mở khóa, gỡ tin + phạt điểm) nhưng KHÔNG
-- có các trang admin khác. PHẢI chạy TÁCH RIÊNG, TRƯỚC 20260705010000
-- (Postgres không cho dùng enum value vừa ADD trong cùng transaction —
-- pattern như 20260701020000_news_category_add_3).

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';
