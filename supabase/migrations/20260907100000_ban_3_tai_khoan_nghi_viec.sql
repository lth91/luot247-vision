-- Khoá đăng nhập 3 tài khoản của 2 nhân viên nghỉ việc (nối tiếp
-- 20260904090000 và 20260907090000, hai file đó mới gỡ quyền + gỡ bảng công).
-- banned_until chính là ô mà nút "Ban user" trên Dashboard ghi vào; đặt xa 100
-- năm = khoá vô thời hạn nhưng vẫn đảo ngược được.
--
--   luong.thi.thao.denco@gmail.com         — Lương Thị Thảo
--   nguyen.giap.thu.thuy.denco@gmail.com   — Nguyễn Giáp Thu Thủy (email chính)
--   thu.thuy.denco@gmail.com               — Nguyễn Giáp Thu Thủy (email gọn)
--
-- Vũ Thái Dương không có trong danh sách: tài khoản đã bị xoá hẳn khỏi
-- auth.users từ trước, không còn gì để khoá.
--
-- Đã chạy trực tiếp 07/09.
--
-- GỠ KHOÁ (nếu nhầm): UPDATE auth.users SET banned_until = NULL WHERE lower(email) IN (...);
-- Nhớ cấp lại user_roles và chèn lại dòng submission_whitelist — xem 2 file trên.

UPDATE auth.users
   SET banned_until = now() + interval '100 years'
 WHERE lower(email) IN ('luong.thi.thao.denco@gmail.com',
                        'nguyen.giap.thu.thuy.denco@gmail.com',
                        'thu.thuy.denco@gmail.com');
