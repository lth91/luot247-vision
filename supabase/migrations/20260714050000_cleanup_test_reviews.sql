-- One-shot DML (user chạy tay 14/07): dọn dữ liệu DUYỆT THỬ của admin
-- (longth91) trong giai đoạn test trang /duyet-tin-ai — xóa 4 tin AI đã duyệt
-- thử khỏi trang chủ + toàn bộ record công duyệt của admin khỏi review_log.
-- Tin bị loại thử giữ nguyên (url_hash tiếp tục chặn re-crawl).

DELETE FROM news
WHERE submitted_by IS NULL
  AND review_status = 'approved'
  AND reviewed_by = (SELECT id FROM profiles WHERE lower(email) = 'longth91@gmail.com');

DELETE FROM review_log
WHERE reviewer_id = (SELECT id FROM profiles WHERE lower(email) = 'longth91@gmail.com');
