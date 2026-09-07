-- Gỡ 2 nhân viên nghỉ việc khỏi bảng xếp hạng (/bang-xep-hang): Lương Thị Thảo
-- và Vũ Thái Dương. Danh sách thành viên của cả get_submission_dashboard() lẫn
-- get_review_dashboard() đều lấy FROM submission_whitelist, nên xoá dòng ở đây
-- là mất khỏi cả hai bảng; đồng thời mất luôn quyền gửi tin (is_submission_allowed
-- kiểm tra chính bảng này) — đúng ý sếp, hai bạn đã bị thu hồi quyền hôm nay.
--
-- Tin đã gửi KHÔNG mất: news.submitted_by và submission_log vẫn nguyên (Lương
-- Thị Thảo có 4.406 tin). Chỉ là không còn hiện thành một dòng trong bảng công.
--
-- Đã chạy trực tiếp 07/09; file này để lại dấu trong git. Thành viên 30 → 28.
--
-- KHÔI PHỤC (nếu gỡ nhầm) — dán nguyên khối này:
--   INSERT INTO public.submission_whitelist (email, email_alias, full_name, created_at)
--   VALUES
--     ('luong.thi.thao.denco@gmail.com', 'thi.thao.denco@gmail.com', 'Lương Thị Thảo', '2026-07-02 04:22:00.002547+00'),
--     ('vu.thai.duong.denco@gmail.com',  'vu.duong.denco@gmail.com', 'Vũ Thái Dương',  '2026-07-03 02:34:27.727761+00')
--   ON CONFLICT (email) DO NOTHING;

DELETE FROM public.submission_whitelist
 WHERE email IN ('luong.thi.thao.denco@gmail.com', 'vu.thai.duong.denco@gmail.com')
    OR email_alias IN ('thi.thao.denco@gmail.com', 'vu.duong.denco@gmail.com');
