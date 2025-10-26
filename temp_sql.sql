-- Bước 1: Cập nhật các tin tức đang sử dụng categories cũ sang 'van-hoa-xa-hoi-khoa-hoc'
UPDATE public.news
SET category = 'van-hoa-xa-hoi-khoa-hoc'
WHERE category IN ('xa-hoi', 'the-thao', 'giai-tri', 'cong-nghe', 'khac');

-- Bước 2: Xóa kiểu enum cũ và tạo kiểu enum mới
ALTER TYPE news_category RENAME TO news_category_old;

CREATE TYPE news_category AS ENUM (
    'kinh-te',
    'phap-luat',
    'chinh-tri',
    'the-gioi',
    'van-hoa-xa-hoi-khoa-hoc'
);

-- Cập nhật cột 'category' trong bảng 'news'
ALTER TABLE public.news
ALTER COLUMN category TYPE news_category USING category::text::news_category;

-- Xóa kiểu enum cũ
DROP TYPE news_category_old;

-- Xác minh các giá trị enum mới
SELECT enumlabel FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'news_category') ORDER BY enumlabel;
