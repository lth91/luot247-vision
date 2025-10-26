-- Run this SQL on your Supabase Dashboard (SQL Editor)
-- This adds the is_approved column to the news table and implements the approval system

-- Step 1: Add is_approved column to news table
ALTER TABLE public.news 
ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT false;

-- Step 2: Update existing news to be approved by default (to maintain backward compatibility)
UPDATE public.news 
SET is_approved = true 
WHERE is_approved IS NULL;

-- Step 3: Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_news_is_approved ON public.news(is_approved);

-- Step 4: Add comment to explain the column
COMMENT ON COLUMN public.news.is_approved IS 'Indicates whether the news item has been approved by a moderator and can appear on the homepage';

-- Verify the column was added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'news' 
AND column_name = 'is_approved';

