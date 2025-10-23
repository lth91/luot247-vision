-- Fix security warning: Set search_path for get_current_stats function
DROP FUNCTION IF EXISTS public.get_current_stats();

CREATE OR REPLACE FUNCTION public.get_current_stats()
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
  base_total INTEGER;
  base_yesterday INTEGER;
  base_today INTEGER;
  base_week INTEGER;
  base_month INTEGER;
  today_views INTEGER;
  yesterday_views INTEGER;
  week_views INTEGER;
  month_views INTEGER;
  total_views INTEGER;
BEGIN
  -- Get base values
  SELECT stat_value INTO base_total FROM public.view_stats_base WHERE stat_key = 'base_total';
  SELECT stat_value INTO base_yesterday FROM public.view_stats_base WHERE stat_key = 'base_yesterday';
  SELECT stat_value INTO base_today FROM public.view_stats_base WHERE stat_key = 'base_today';
  SELECT stat_value INTO base_week FROM public.view_stats_base WHERE stat_key = 'base_week';
  SELECT stat_value INTO base_month FROM public.view_stats_base WHERE stat_key = 'base_month';
  
  -- Count today's views
  SELECT COALESCE(COUNT(*), 0) INTO today_views
  FROM public.view_logs
  WHERE DATE(viewed_at) = CURRENT_DATE;
  
  -- Count yesterday's views
  SELECT COALESCE(COUNT(*), 0) INTO yesterday_views
  FROM public.view_logs
  WHERE DATE(viewed_at) = CURRENT_DATE - INTERVAL '1 day';
  
  -- Count this week's views
  SELECT COALESCE(COUNT(*), 0) INTO week_views
  FROM public.view_logs
  WHERE viewed_at >= DATE_TRUNC('week', CURRENT_DATE);
  
  -- Count this month's views
  SELECT COALESCE(COUNT(*), 0) INTO month_views
  FROM public.view_logs
  WHERE viewed_at >= DATE_TRUNC('month', CURRENT_DATE);
  
  -- Count total views (all time)
  SELECT COALESCE(COUNT(*), 0) INTO total_views
  FROM public.view_logs;
  
  -- Return combined values
  RETURN QUERY SELECT 
    base_yesterday + yesterday_views,
    base_today + today_views,
    base_week + week_views,
    base_month + month_views,
    base_total + total_views;
END;
$$;