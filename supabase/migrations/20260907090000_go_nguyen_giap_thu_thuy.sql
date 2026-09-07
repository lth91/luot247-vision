-- Gỡ Nguyễn Giáp Thu Thủy (nghỉ việc) — tiếp nối 20260904090000.
--
-- LƯU Ý: bạn này có HAI tài khoản đăng nhập, không phải một:
--   nguyen.giap.thu.thuy.denco@gmail.com  (9060abb6-…) — 9.113 tin, đăng nhập cuối 28/08
--   thu.thuy.denco@gmail.com              (de4ece41-…) — 0 tin, chính là email_alias
-- Email gọn trong migration 20260718020000 được đăng ký thành tài khoản riêng,
-- nên chỉ gỡ một cái là bạn ấy vẫn đăng nhập được bằng cái kia. Phải gỡ cả hai.
--
-- Tin đã gửi KHÔNG mất: news.submitted_by và submission_log giữ nguyên 9.113 tin.
-- Khoá đăng nhập làm riêng bằng nút Ban user trên Dashboard (cả hai email).
--
-- Đã chạy trực tiếp 07/09: gỡ 2 dòng user_roles, đóng 18 phiên, thành viên 28 → 27.
--
-- KHÔI PHỤC (nếu gỡ nhầm):
--   INSERT INTO public.submission_whitelist (email, email_alias, full_name, created_at)
--   VALUES ('nguyen.giap.thu.thuy.denco@gmail.com', 'thu.thuy.denco@gmail.com',
--           'Nguyễn Giáp Thu Thủy', '2026-07-20 04:14:55.583143+00')
--   ON CONFLICT (email) DO NOTHING;
--   INSERT INTO public.user_roles (user_id, role) VALUES
--     ('9060abb6-332b-4f6d-b414-f54bdde70fed', 'user'),
--     ('de4ece41-3030-4733-889d-88ca4a44620f', 'user');

DELETE FROM public.user_roles
 WHERE user_id IN ('9060abb6-332b-4f6d-b414-f54bdde70fed',
                   'de4ece41-3030-4733-889d-88ca4a44620f');

DELETE FROM auth.sessions
 WHERE user_id IN ('9060abb6-332b-4f6d-b414-f54bdde70fed',
                   'de4ece41-3030-4733-889d-88ca4a44620f');

DELETE FROM public.submission_whitelist
 WHERE email = 'nguyen.giap.thu.thuy.denco@gmail.com'
    OR email_alias = 'thu.thuy.denco@gmail.com';
