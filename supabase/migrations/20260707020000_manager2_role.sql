-- Cấp role 'manager' cho tài khoản giám sát thứ 2: manager@luot247.com
-- (yêu cầu sếp 07/07 — toàn quyền thẻ + gỡ tin + mở khóa, không có trang admin
-- khác). Điều kiện: tài khoản phải ĐĂNG KÝ trước trên /auth — chưa có account
-- thì câu này no-op, đăng ký xong chạy lại. KHÔNG thêm vào submission_whitelist
-- (chỉ giám sát, không gửi tin). Idempotent.

UPDATE public.user_roles
SET role = 'manager'
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'manager@luot247.com')
  AND role = 'user';

-- Phòng hờ: nếu vì lý do nào đó có 2 dòng role → giữ manager, xóa dòng thừa
-- (2 dòng role làm .maybeSingle() ở frontend lỗi "không có quyền").
DELETE FROM public.user_roles
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'manager@luot247.com')
  AND role <> 'manager'
  AND EXISTS (
    SELECT 1 FROM public.user_roles r2
    WHERE r2.user_id = user_roles.user_id AND r2.role = 'manager'
  );
