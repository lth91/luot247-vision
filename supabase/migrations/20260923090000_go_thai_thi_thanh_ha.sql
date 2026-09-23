-- Gỡ Thái Thị Thanh Hà (nghỉ việc) — người thứ tư, nối tiếp 20260904090000,
-- 20260907090000 và 20260907100000. Lần này gộp cả 4 bước vào một file thay vì
-- tách như mấy lượt đầu.
--
--   thai.ha.denco@gmail.com  (afff14dd-…) — 6.043 tin, email_alias NULL nên chỉ
--   MỘT tài khoản đăng nhập (khác Nguyễn Giáp Thu Thủy vốn có hai).
--
-- Tin đã gửi KHÔNG mất: news.submitted_by giữ nguyên 6.043 tin.
-- Đã chạy trực tiếp 23/09: gỡ quyền, đóng 2 phiên, xoá dòng bảng công
-- (thành viên 27 → 26), ban đăng nhập.
--
-- KHÔI PHỤC (nếu gỡ nhầm):
--   UPDATE auth.users SET banned_until = NULL WHERE id = 'afff14dd-63dc-43da-a7f1-3e8b17c182c4';
--   INSERT INTO public.user_roles (user_id, role)
--     VALUES ('afff14dd-63dc-43da-a7f1-3e8b17c182c4', 'user');
--   INSERT INTO public.submission_whitelist (email, email_alias, full_name, created_at)
--     VALUES ('thai.ha.denco@gmail.com', NULL, 'Thái Thị Thanh Hà', '2026-07-02 04:22:00.002547+00')
--     ON CONFLICT (email) DO NOTHING;

DELETE FROM public.user_roles
 WHERE user_id = 'afff14dd-63dc-43da-a7f1-3e8b17c182c4';

DELETE FROM auth.sessions
 WHERE user_id = 'afff14dd-63dc-43da-a7f1-3e8b17c182c4';

DELETE FROM public.submission_whitelist
 WHERE email = 'thai.ha.denco@gmail.com';

UPDATE auth.users
   SET banned_until = now() + interval '100 years'
 WHERE id = 'afff14dd-63dc-43da-a7f1-3e8b17c182c4';
