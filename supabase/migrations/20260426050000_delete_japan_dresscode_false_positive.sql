-- Xoá bài lifestyle Nhật Bản về dress code (Cool Biz) — slipped through classifier cũ
-- trước khi deploy classifier siết (26/04 03:00). Bài crawl lúc 01:30.
-- Classifier mới đã thêm explicit reject example cho lifestyle/cultural foreign news.

DELETE FROM public.electricity_news
WHERE original_url = 'https://vnexpress.net/cong-chuc-nhat-duoc-khuyen-khich-mac-quan-short-di-lam-5067106.html';
