-- Add new categories to news_category enum
ALTER TYPE news_category ADD VALUE IF NOT EXISTS 'phap-luat';
ALTER TYPE news_category ADD VALUE IF NOT EXISTS 'the-gioi';
ALTER TYPE news_category ADD VALUE IF NOT EXISTS 'van-hoa-xa-hoi-khoa-hoc';
