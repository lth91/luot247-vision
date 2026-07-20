-- Thay đổi nhân sự 17/07 (Minh Denco nhắn anh Long): gỡ Nguyễn Phương Chúc
-- khỏi whitelist gửi tin, thêm nhân viên mới Thu Thủy. Idempotent.
-- Lưu ý: xóa khỏi whitelist chỉ chặn quyền gửi/duyệt tin từ giờ trở đi —
-- tin và số liệu cũ của bạn Chúc trên bảng thống kê tháng này vẫn giữ.

DELETE FROM public.submission_whitelist
WHERE email = 'nguyen.chuc.denco@gmail.com';

INSERT INTO public.submission_whitelist (email, full_name) VALUES
  ('nguyen.giap.thu.thuy.denco@gmail.com', 'Nguyễn Giáp Thu Thủy')
ON CONFLICT (email) DO NOTHING;
