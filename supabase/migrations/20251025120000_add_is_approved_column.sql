-- Add is_approved column to news table
-- This column will be used to determine if a news item is approved to appear on the homepage

ALTER TABLE public.news 
ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT false;

-- Update existing news to be approved by default (to maintain backward compatibility)
UPDATE public.news 
SET is_approved = true 
WHERE is_approved IS NULL;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_news_is_approved ON public.news(is_approved);

-- Add comment to explain the column
COMMENT ON COLUMN public.news.is_approved IS 'Indicates whether the news item has been approved by a moderator and can appear on the homepage';

