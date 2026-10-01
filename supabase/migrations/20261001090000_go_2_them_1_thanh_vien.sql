-- 01/10: gỡ 2 nhân viên nghỉ việc + thêm 1 nhân viên mới (yêu cầu của Minh Denco).
--
-- GỠ (mỗi người 1 tài khoản, email_alias NULL — không dính bẫy hai email):
--   tran.minh.hang.denco@gmail.com (9dbecd60-…) — Trần Thị Minh Hằng
--   tran.bao.ngoc.denco@gmail.com  (88765998-…) — Trần Bảo Ngọc
-- Thu hồi quyền, đóng 5 phiên, xoá dòng bảng công, khoá đăng nhập. Tin đã gửi
-- giữ nguyên (news.submitted_by không đụng tới).
--
-- THÊM: dang.huyen.denco@gmail.com — Đặng Ngọc Huyền. Chỉ cần dòng whitelist;
-- khi bạn ấy tự đăng ký, trigger on_auth_user_created → handle_new_user tự tạo
-- profile + gán quyền 'user'.
--
-- Thành viên 26 → 25 (−2 +1). Đã chạy trực tiếp 01/10.
--
-- KHÔI PHỤC 2 người gỡ (nếu nhầm):
--   UPDATE auth.users SET banned_until = NULL
--    WHERE id IN ('9dbecd60-dfd3-43a5-b1b7-1303d049648c', '88765998-959a-4dd7-9908-8362e06db679');
--   INSERT INTO public.user_roles (user_id, role) VALUES
--     ('9dbecd60-dfd3-43a5-b1b7-1303d049648c', 'user'),
--     ('88765998-959a-4dd7-9908-8362e06db679', 'user');
--   INSERT INTO public.submission_whitelist (email, full_name, created_at) VALUES
--     ('tran.minh.hang.denco@gmail.com', 'Trần Thị Minh Hằng', '2026-07-02 04:22:00.002547+00'),
--     ('tran.bao.ngoc.denco@gmail.com',  'Trần Bảo Ngọc',      '2026-07-02 04:22:00.002547+00')
--   ON CONFLICT (email) DO NOTHING;

DELETE FROM public.user_roles
 WHERE user_id IN ('9dbecd60-dfd3-43a5-b1b7-1303d049648c', '88765998-959a-4dd7-9908-8362e06db679');

DELETE FROM auth.sessions
 WHERE user_id IN ('9dbecd60-dfd3-43a5-b1b7-1303d049648c', '88765998-959a-4dd7-9908-8362e06db679');

DELETE FROM public.submission_whitelist
 WHERE email IN ('tran.minh.hang.denco@gmail.com', 'tran.bao.ngoc.denco@gmail.com');

UPDATE auth.users
   SET banned_until = now() + interval '100 years'
 WHERE id IN ('9dbecd60-dfd3-43a5-b1b7-1303d049648c', '88765998-959a-4dd7-9908-8362e06db679');

INSERT INTO public.submission_whitelist (email, full_name)
VALUES ('dang.huyen.denco@gmail.com', 'Đặng Ngọc Huyền')
ON CONFLICT (email) DO NOTHING;
