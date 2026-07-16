-- Nâng nhịp quét crawl-news 1 giờ → 30 phút (sếp duyệt 16/07 sau khi vá
-- memory crash). 56 feed, mỗi run xử lý ~4-6 nguồn trong 2 phút → nhịp 30'
-- đưa vòng quay mỗi feed từ ~14h xuống ~7h. Chi phí ước ~$5-6/ngày,
-- trong ngân sách $250-450/tháng đã chốt.
-- Giữ phút :05/:35 để tránh đụng các job đầu giờ (daily-auto-views...).
-- cron.schedule cùng jobname → ghi đè lịch cũ, không tạo job trùng.

SELECT cron.schedule('crawl-news-tick', '5,35 * * * *', 'SELECT public.call_crawl_news()');
