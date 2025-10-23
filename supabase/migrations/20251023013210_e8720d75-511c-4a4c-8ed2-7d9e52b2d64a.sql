-- Create view_logs table to track view history
CREATE TABLE IF NOT EXISTS public.view_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  news_id uuid REFERENCES public.news(id) ON DELETE CASCADE,
  viewed_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.view_logs ENABLE ROW LEVEL SECURITY;

-- Allow everyone to view logs (for statistics)
CREATE POLICY "View logs are viewable by everyone"
  ON public.view_logs
  FOR SELECT
  USING (true);

-- Only authenticated users can insert view logs
CREATE POLICY "Authenticated users can insert view logs"
  ON public.view_logs
  FOR INSERT
  WITH CHECK (true);

-- Create index for better performance on queries
CREATE INDEX idx_view_logs_viewed_at ON public.view_logs(viewed_at);
CREATE INDEX idx_view_logs_news_id ON public.view_logs(news_id);

-- Update the increment_view_count function to also log the view
CREATE OR REPLACE FUNCTION public.increment_view_count(news_id_param uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Increment view count
  UPDATE public.news
  SET view_count = view_count + 1,
      updated_at = now()
  WHERE id = news_id_param;
  
  -- Log the view
  INSERT INTO public.view_logs (news_id, viewed_at)
  VALUES (news_id_param, now());
END;
$function$;