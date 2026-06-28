-- Dọn tin bị CHÈN TRÁI PHÉP vào bảng `news` ngày 27/6/2026.
--
-- Bối cảnh: hàng chục tin tự xuất hiện theo từng đợt (~05:36, 06:59, 07:36 UTC),
-- submitted_by=NULL, không do team đăng và KHÔNG do function nào trong repo tạo
-- (chỉ submit-news set submitted_by≠NULL; import-google-sheet set is_approved=false).
-- Nguồn: client ngoài gọi thẳng Supabase API, lợi dụng RLS cũ "Authenticated users
-- can insert news" (đã siết về admin/mod ở migration 20260629010100).
--
-- Migration này được áp THỦ CÔNG qua SQL Editor (DML), commit để lưu lịch sử git
-- theo quy ước repo. Backup trước khi xoá để có thể khôi phục.

-- 1) Backup (giữ lại bản sao phòng khi cần khôi phục).
CREATE TABLE IF NOT EXISTS public.news_backup_20260627 AS
SELECT * FROM public.news
WHERE submitted_by IS NULL
  AND created_at >= '2026-06-27 00:00:00+00';

-- 2) Xoá tin rác (submitted_by NULL + tạo từ đầu ngày 27/6 UTC).
DELETE FROM public.news
WHERE submitted_by IS NULL
  AND created_at >= '2026-06-27 00:00:00+00';
