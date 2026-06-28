-- Sửa tác dụng phụ: backfill title_normalized ở migration 20260629010100 đã
-- UPDATE toàn bộ ~100k tin → trigger BEFORE UPDATE `update_news_updated_at`
-- (set updated_at = now()) đẩy updated_at của MỌI tin = giờ chạy migration
-- (2026-06-28 02:20:25). Trang chủ sắp xếp/hiện theo updated_at → toàn bộ tin
-- cũ (kể cả 2025) vọt lên đầu feed như mới đăng.
--
-- Khắc phục (đã áp thủ công qua SQL Editor): tắt trigger, set updated_at về
-- created_at cho các tin bị bump, bật lại trigger. Commit để lưu lịch sử.
--
-- BÀI HỌC: backfill hàng loạt trên bảng có trigger updated_at PHẢI tắt trigger
-- trước (DISABLE TRIGGER) để không vô tình bump updated_at toàn bảng.

ALTER TABLE public.news DISABLE TRIGGER update_news_updated_at;

UPDATE public.news
SET updated_at = created_at
WHERE updated_at = '2026-06-28 02:20:25.179933+00';

ALTER TABLE public.news ENABLE TRIGGER update_news_updated_at;
