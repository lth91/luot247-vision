-- Run this SQL on your Supabase Dashboard (SQL Editor)
-- This adds the new categories to the news_category enum

-- Add new categories to news_category enum
ALTER TYPE news_category ADD VALUE IF NOT EXISTS 'phap-luat';
ALTER TYPE news_category ADD VALUE IF NOT EXISTS 'the-gioi';
ALTER TYPE news_category ADD VALUE IF NOT EXISTS 'van-hoa-xa-hoi-khoa-hoc';

-- Verify the enum values
SELECT enumlabel FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'news_category') ORDER BY enumlabel;

