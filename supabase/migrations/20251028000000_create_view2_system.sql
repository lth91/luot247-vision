-- Create view_stats2 table for new view tracking system
-- This system resets at 7:00 AM GMT+7 (Vietnam time) daily

CREATE TABLE IF NOT EXISTS public.view_stats2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stat_key TEXT UNIQUE NOT NULL,
  stat_value INTEGER NOT NULL DEFAULT 0,
  last_reset_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.view_stats2 ENABLE ROW LEVEL SECURITY;

-- Allow everyone to read stats
CREATE POLICY "view_stats2_readable_by_everyone"
  ON public.view_stats2
  FOR SELECT
  USING (true);

-- Only authenticated users can update
CREATE POLICY "view_stats2_updatable_by_authenticated"
  ON public.view_stats2
  FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- Create view_logs2 table for tracking individual views
CREATE TABLE IF NOT EXISTS public.view_logs2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viewed_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.view_logs2 ENABLE ROW LEVEL SECURITY;

-- Allow everyone to read and insert logs
CREATE POLICY "view_logs2_readable_by_everyone"
  ON public.view_logs2
  FOR SELECT
  USING (true);

CREATE POLICY "view_logs2_insertable_by_everyone"
  ON public.view_logs2
  FOR INSERT
  WITH CHECK (true);

-- Insert initial stats with 0 values
INSERT INTO public.view_stats2 (stat_key, stat_value, last_reset_at) VALUES
  ('yesterday', 0, now()),
  ('today', 0, now()),
  ('this_week', 0, now()),
  ('this_month', 0, now()),
  ('total', 0, now())
ON CONFLICT (stat_key) DO NOTHING;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_view_logs2_viewed_at ON public.view_logs2(viewed_at);
CREATE INDEX IF NOT EXISTS idx_view_logs2_created_at ON public.view_logs2(created_at);

-- Create function to get Vietnam time zone (GMT+7)
CREATE OR REPLACE FUNCTION vietnam_time()
RETURNS TIMESTAMP WITH TIME ZONE
LANGUAGE sql
STABLE
AS $$
  SELECT now() AT TIME ZONE 'Asia/Ho_Chi_Minh';
$$;

-- Create function to get current stats for view2
-- This function returns base values + actual logs count
CREATE OR REPLACE FUNCTION get_view2_stats()
RETURNS TABLE (
  yesterday INTEGER,
  today INTEGER,
  this_week INTEGER,
  this_month INTEGER,
  total INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_yesterday INTEGER;
  v_today INTEGER;
  v_this_week INTEGER;
  v_this_month INTEGER;
  v_total INTEGER;
  v_base_yesterday INTEGER;
  v_base_today INTEGER;
  v_base_this_week INTEGER;
  v_base_this_month INTEGER;
  v_base_total INTEGER;
  v_log_yesterday INTEGER;
  v_log_today INTEGER;
  v_log_this_week INTEGER;
  v_log_this_month INTEGER;
  v_log_total INTEGER;
  v_now TIMESTAMP WITH TIME ZONE;
  v_today_7am TIMESTAMP WITH TIME ZONE;
  v_yesterday_7am TIMESTAMP WITH TIME ZONE;
  v_week_start TIMESTAMP WITH TIME ZONE;
  v_month_start TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Get base stats (editable values)
  SELECT COALESCE(stat_value, 0) INTO v_base_yesterday FROM public.view_stats2 WHERE stat_key = 'yesterday';
  SELECT COALESCE(stat_value, 0) INTO v_base_today FROM public.view_stats2 WHERE stat_key = 'today';
  SELECT COALESCE(stat_value, 0) INTO v_base_this_week FROM public.view_stats2 WHERE stat_key = 'this_week';
  SELECT COALESCE(stat_value, 0) INTO v_base_this_month FROM public.view_stats2 WHERE stat_key = 'this_month';
  SELECT COALESCE(stat_value, 0) INTO v_base_total FROM public.view_stats2 WHERE stat_key = 'total';
  
  -- Get current Vietnam time
  v_now := now();
  
  -- Calculate today 7:00 AM GMT+7 (Vietnam time)
  v_today_7am := (DATE_TRUNC('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'UTC' + INTERVAL '7 hours');
  
  -- Calculate yesterday 7:00 AM
  v_yesterday_7am := v_today_7am - INTERVAL '1 day';
  
  -- Calculate this week start (Monday) at 7 AM
  v_week_start := DATE_TRUNC('week', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'UTC' + INTERVAL '7 hours';
  
  -- Calculate this month start at 7 AM
  v_month_start := DATE_TRUNC('month', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'UTC' + INTERVAL '7 hours';
  
  -- Count actual logs
  SELECT COALESCE(COUNT(*), 0) INTO v_log_today
  FROM public.view_logs2
  WHERE viewed_at >= v_today_7am;
  
  SELECT COALESCE(COUNT(*), 0) INTO v_log_yesterday
  FROM public.view_logs2
  WHERE viewed_at >= v_yesterday_7am AND viewed_at < v_today_7am;
  
  SELECT COALESCE(COUNT(*), 0) INTO v_log_this_week
  FROM public.view_logs2
  WHERE viewed_at >= v_week_start;
  
  SELECT COALESCE(COUNT(*), 0) INTO v_log_this_month
  FROM public.view_logs2
  WHERE viewed_at >= v_month_start;
  
  SELECT COALESCE(COUNT(*), 0) INTO v_log_total
  FROM public.view_logs2;
  
  -- Return base + logs
  RETURN QUERY SELECT
    v_base_yesterday + v_log_yesterday,
    v_base_today + v_log_today,
    v_base_this_week + v_log_this_week,
    v_base_this_month + v_log_this_month,
    v_base_total + v_log_total;
END;
$$;

-- Create function to add view logs
CREATE OR REPLACE FUNCTION add_view2_logs(count INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  i INTEGER;
BEGIN
  FOR i IN 1..count LOOP
    INSERT INTO public.view_logs2 (viewed_at)
    VALUES (now());
  END LOOP;
END;
$$;

