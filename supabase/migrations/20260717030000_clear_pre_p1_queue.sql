-- One-shot 17/07: dọn tồn kho hàng đợi tin tự động crawl TRƯỚC khi giám khảo
-- P1 bật (lượt chạy đầu 08:05 UTC = 15:05 VN, xem crawl_reject_log). 14 tin
-- này vào hàng đợi theo cơ chế cũ (chưa qua đối chiếu bài gốc + phán trùng),
-- nhiều ca trùng thật 45-70% — sếp muốn theo dõi số liệu thuần chế độ mới.
-- Đánh dấu rejected thay vì DELETE: giữ url_hash chặn crawler re-crawl đúng
-- các bài này; nightly maintenance tự purge rejected sau 30 ngày.

UPDATE public.news
SET review_status = 'rejected',
    reviewed_at = now()
WHERE review_status = 'pending'
  AND submitted_by IS NULL
  AND created_at < '2026-07-17 08:05:00+00';
