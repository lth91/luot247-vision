-- Khóa ĐỌC raw view_logs2 khỏi người ngoài (Mức A).
-- Trước: policy "view_logs2_readable_by_everyone" cho MỌI người (kể cả anon qua
-- publishable key trong frontend) SELECT toàn bộ dòng → người ngoài có thể kéo
-- raw log timestamp về phân tích. Đổi: CHỈ admin được đọc.
--
-- KHÔNG ảnh hưởng:
--   • Ghi view thật từ frontend (Index.tsx insert) — giữ nguyên policy INSERT.
--   • Hiển thị /viewcount — qua RPC get_view2_stats (SECURITY DEFINER, bỏ qua RLS).
--   • Trang admin ViewManagement2 (đếm/xoá view_logs2) — chạy bằng tài khoản admin,
--     khớp policy đọc admin mới + policy DELETE admin sẵn có.
--   • Cron daily-auto-views / reset (service_role) — bỏ qua RLS.
-- Chặn: anon + user thường (kể cả tài khoản tự đăng ký) đọc raw log.

DROP POLICY IF EXISTS "view_logs2_readable_by_everyone" ON public.view_logs2;
DROP POLICY IF EXISTS "view_logs2_readable_by_admin" ON public.view_logs2;

CREATE POLICY "view_logs2_readable_by_admin"
  ON public.view_logs2
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
