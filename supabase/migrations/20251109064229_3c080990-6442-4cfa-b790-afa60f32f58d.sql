-- Function to backfill daily stats with distributed current stats
CREATE OR REPLACE FUNCTION public.backfill_current_stats_distributed()
RETURNS TABLE(processed_date date, view_count integer, source text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_stats RECORD;
  v_current_date DATE;
  v_week_start DATE;
  v_month_start DATE;
  v_day_count INTEGER;
  v_avg_daily_week NUMERIC;
  v_avg_daily_month NUMERIC;
  v_random_factor NUMERIC;
  v_calculated_count INTEGER;
  v_vietnam_now TIMESTAMP;
BEGIN
  -- Get current stats
  SELECT * INTO v_stats FROM get_view2_stats() LIMIT 1;
  
  -- Get current date in Vietnam timezone
  v_vietnam_now := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_current_date := DATE(v_vietnam_now);
  
  -- Calculate week start (Monday)
  v_week_start := v_current_date - (EXTRACT(ISODOW FROM v_current_date)::INTEGER - 1);
  
  -- Calculate month start
  v_month_start := DATE_TRUNC('month', v_current_date::TIMESTAMP)::DATE;
  
  -- Calculate how many days to distribute for week
  v_day_count := (v_current_date - v_week_start)::INTEGER + 1;
  
  -- Average daily views for week (with some buffer for variation)
  IF v_day_count > 0 THEN
    v_avg_daily_week := v_stats.this_week::NUMERIC / v_day_count;
  ELSE
    v_avg_daily_week := 0;
  END IF;
  
  -- Calculate how many days to distribute for month
  v_day_count := (v_current_date - v_month_start)::INTEGER + 1;
  
  -- Average daily views for month
  IF v_day_count > 0 THEN
    v_avg_daily_month := v_stats.this_month::NUMERIC / v_day_count;
  ELSE
    v_avg_daily_month := 0;
  END IF;
  
  RAISE NOTICE 'Week avg: %, Month avg: %', v_avg_daily_week, v_avg_daily_month;
  
  -- Backfill week data (Monday to today)
  FOR i IN 0..(v_current_date - v_week_start)::INTEGER LOOP
    -- Random factor between 0.7 and 1.3 (±30% variation)
    v_random_factor := 0.7 + (random() * 0.6);
    v_calculated_count := GREATEST(0, ROUND(v_avg_daily_week * v_random_factor)::INTEGER);
    
    INSERT INTO public.daily_view_stats2 (view_date, view_count, updated_at)
    VALUES (v_week_start + i, v_calculated_count, now())
    ON CONFLICT (view_date) 
    DO UPDATE SET 
      view_count = EXCLUDED.view_count,
      updated_at = now();
    
    RETURN QUERY SELECT v_week_start + i, v_calculated_count, 'week'::text;
  END LOOP;
  
  -- Backfill month data (1st to today, but skip days already done in week)
  FOR i IN 0..(v_current_date - v_month_start)::INTEGER LOOP
    -- Skip if this date is already in the current week (to avoid overwriting)
    IF (v_month_start + i) < v_week_start THEN
      v_random_factor := 0.7 + (random() * 0.6);
      v_calculated_count := GREATEST(0, ROUND(v_avg_daily_month * v_random_factor)::INTEGER);
      
      INSERT INTO public.daily_view_stats2 (view_date, view_count, updated_at)
      VALUES (v_month_start + i, v_calculated_count, now())
      ON CONFLICT (view_date) 
      DO UPDATE SET 
        view_count = EXCLUDED.view_count,
        updated_at = now();
      
      RETURN QUERY SELECT v_month_start + i, v_calculated_count, 'month'::text;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Backfilled stats from % to %', v_month_start, v_current_date;
END;
$function$;

-- Run the backfill immediately
SELECT * FROM public.backfill_current_stats_distributed();