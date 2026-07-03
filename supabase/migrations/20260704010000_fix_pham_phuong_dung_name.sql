-- Sửa tên trong whitelist: Phạm Thị Dung → Phạm Phương Dung (yêu cầu 04/07,
-- email không đổi: pham.phuong.dung.denco@gmail.com). Idempotent.

UPDATE public.submission_whitelist
SET full_name = 'Phạm Phương Dung'
WHERE email = 'pham.phuong.dung.denco@gmail.com';
