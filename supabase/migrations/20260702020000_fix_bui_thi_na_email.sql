-- Sửa email đăng ký gửi tin của Bùi Thị Na (seed trong 20260702010000 bị sai):
-- bui.na.denco@gmail.com → bui.thi.na.denco@gmail.com. Idempotent.

UPDATE public.submission_whitelist
SET email = 'bui.thi.na.denco@gmail.com'
WHERE email = 'bui.na.denco@gmail.com';

-- Phòng trường hợp dòng cũ không tồn tại (DB chưa từng seed email sai).
INSERT INTO public.submission_whitelist (email, full_name)
VALUES ('bui.thi.na.denco@gmail.com', 'Bùi Thị Na')
ON CONFLICT (email) DO NOTHING;
