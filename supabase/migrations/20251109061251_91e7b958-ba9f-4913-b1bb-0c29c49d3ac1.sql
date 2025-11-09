-- Fix update_daily_view_stats function to avoid ambiguous column reference
CREATE OR REPLACE FUNCTION public.update_daily_view_stats(p_date date DEFAULT NULL::date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_target_date DATE;
  v_start_time TIMESTAMP WITH TIME ZONE;
  v_end_time TIMESTAMP WITH TIME ZONE;
  v_view_count INTEGER;
BEGIN
  -- If no date provided, use today in GMT+7
  IF p_date IS NULL THEN
    v_target_date := (DATE_TRUNC('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'UTC')::DATE;
  ELSE
    v_target_date := p_date;
  END IF;
  
  -- Calculate time range for this date in GMT+7
  -- Date starts at 7:00 AM GMT+7 (00:00 UTC same day)
  -- Date ends at 6:59:59 AM GMT+7 next day (23:59:59 UTC same day)
  v_start_time := (DATE_TRUNC('day', (v_target_date || ' 07:00:00')::TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'UTC');
  v_end_time := v_start_time + INTERVAL '1 day' - INTERVAL '1 second';
  
  -- Count views for this date
  SELECT COALESCE(COUNT(*), 0) INTO v_view_count
  FROM public.view_logs2
  WHERE viewed_at >= v_start_time
    AND viewed_at <= v_end_time;
  
  -- Insert or update daily stat
  INSERT INTO public.daily_view_stats2 (view_date, view_count, updated_at)
  VALUES (v_target_date, v_view_count, now())
  ON CONFLICT (view_date) 
  DO UPDATE SET 
    view_count = EXCLUDED.view_count,
    updated_at = now();
  
  RAISE NOTICE 'Updated daily view stats for %: % views', v_target_date, v_view_count;
END;
$$;