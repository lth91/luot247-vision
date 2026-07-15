-- One-shot DML (user chạy tay 16/07): xóa toàn bộ tin AI cũ (viết theo chuẩn
-- 120-140) để pipeline làm lại từ đầu với chuẩn mới 100-120 + HOA + 2 khổ.
-- Điều kiện review_status IS NOT NULL bảo vệ tin nhân viên gửi/tin import cũ.
-- Xóa url_hash đồng nghĩa crawler sẽ tự crawl lại bài còn mới ở run kế tiếp.

DELETE FROM news
WHERE submitted_by IS NULL
  AND review_status IS NOT NULL;

DELETE FROM review_log;
