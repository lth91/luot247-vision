-- Create classification_history table to track user's classification activity
CREATE TABLE IF NOT EXISTS public.classification_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  news_id UUID NOT NULL,
  classified_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT fk_news FOREIGN KEY (news_id) REFERENCES public.news(id) ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE public.classification_history ENABLE ROW LEVEL SECURITY;

-- Create policy for users to view their own classification history
CREATE POLICY "Users can view own classification history"
ON public.classification_history
FOR SELECT
USING (auth.uid() = user_id);

-- Create policy for users to insert their own classification history
CREATE POLICY "Users can insert own classification history"
ON public.classification_history
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_classification_history_user_id ON public.classification_history(user_id);
CREATE INDEX IF NOT EXISTS idx_classification_history_classified_at ON public.classification_history(classified_at);