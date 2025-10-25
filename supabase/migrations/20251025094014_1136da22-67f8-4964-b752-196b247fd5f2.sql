-- Create table for import history
CREATE TABLE public.import_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  user_email TEXT NOT NULL,
  imported_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  news_count INTEGER NOT NULL DEFAULT 0,
  sheet_url TEXT
);

-- Enable RLS
ALTER TABLE public.import_history ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Import history is viewable by authenticated users"
ON public.import_history
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert import history"
ON public.import_history
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);