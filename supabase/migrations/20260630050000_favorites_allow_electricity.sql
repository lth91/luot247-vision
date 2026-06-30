-- /d nay dùng chung card NewsItem (có nút Thích/Yêu thích). Tin điện có id nằm
-- ở electricity_news (không phải news) → khoá ngoại favorites.news_id → news
-- chặn việc favorite tin điện (lỗi 23503). Bỏ khoá ngoại để favorites lưu được
-- cả tin trang chủ lẫn tin điện. Giữ UNIQUE(user_id, news_id) + RLS.
-- (Trang Yêu thích đọc id ở cả news lẫn electricity_news.)

ALTER TABLE public.favorites DROP CONSTRAINT IF EXISTS favorites_news_id_fkey;
