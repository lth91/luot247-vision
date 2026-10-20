-- 20/10: thêm nhân viên mới Lê Trần Mai Linh (le.tran.mai.linh.denco@gmail.com).
--
-- Chỉ cần dòng whitelist; khi bạn ấy tự đăng ký bằng đúng email này, trigger
-- on_auth_user_created → handle_new_user tự tạo profile + gán quyền 'user'.
-- Khác người với Bùi Mai Linh (bui.mai.linh.denco@) đã có sẵn trong danh sách.
--
-- Thành viên 25 → 26. Đã chạy trực tiếp 20/10.

INSERT INTO public.submission_whitelist (email, full_name)
VALUES ('le.tran.mai.linh.denco@gmail.com', 'Lê Trần Mai Linh')
ON CONFLICT (email) DO NOTHING;
