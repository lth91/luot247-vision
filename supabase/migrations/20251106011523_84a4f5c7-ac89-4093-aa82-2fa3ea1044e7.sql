-- Fix reset_daily_view_stats2 function to preserve monthly logs
CREATE OR REPLACE FUNCTION public.reset_daily_view_stats2()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_today_7am TIMESTAMP WITH TIME ZONE;
  v_yesterday_7am TIMESTAMP WITH TIME ZONE;
  v_week_start TIMESTAMP WITH TIME ZONE;
  v_month_start TIMESTAMP WITH TIME ZONE;
  v_prev_month_start TIMESTAMP WITH TIME ZONE;
  v_yesterday_total INTEGER;
  v_today_total INTEGER;
  v_week_total INTEGER;
  v_month_total INTEGER;
  v_is_monday BOOLEAN;
  v_is_first_day BOOLEAN;
BEGIN
  -- Calculate time boundaries (7 AM Vietnam time = UTC + 7)
  v_today_7am := (DATE_TRUNC('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'UTC' + INTERVAL '7 hours');
  v_yesterday_7am := v_today_7am - INTERVAL '1 day';
  v_week_start := DATE_TRUNC('week', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'UTC' + INTERVAL '7 hours';
  v_month_start := DATE_TRUNC('month', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'UTC' + INTERVAL '7 hours';
  v_prev_month_start := v_month_start - INTERVAL '1 month';
  
  -- Check if today is Monday or first day of month
  v_is_monday := EXTRACT(ISODOW FROM now() AT TIME ZONE 'Asia/Ho_Chi_Minh') = 1;
  v_is_first_day := EXTRACT(DAY FROM now() AT TIME ZONE 'Asia/Ho_Chi_Minh') = 1;
  
  -- Get current base values
  DECLARE
    v_base_yesterday INTEGER;
    v_base_today INTEGER;
    v_base_week INTEGER;
    v_base_month INTEGER;
  BEGIN
    SELECT COALESCE(stat_value, 0) INTO v_base_yesterday FROM view_stats2 WHERE stat_key = 'yesterday';
    SELECT COALESCE(stat_value, 0) INTO v_base_today FROM view_stats2 WHERE stat_key = 'today';
    SELECT COALESCE(stat_value, 0) INTO v_base_week FROM view_stats2 WHERE stat_key = 'this_week';
    SELECT COALESCE(stat_value, 0) INTO v_base_month FROM view_stats2 WHERE stat_key = 'this_month';
    
    -- Count logs for yesterday (before today 7am)
    SELECT COALESCE(COUNT(*), 0) INTO v_yesterday_total 
    FROM view_logs2 
    WHERE viewed_at >= v_yesterday_7am AND viewed_at < v_today_7am;
    
    -- Count logs for today (from today 7am)
    SELECT COALESCE(COUNT(*), 0) INTO v_today_total 
    FROM view_logs2 
    WHERE viewed_at >= v_today_7am;
    
    -- Count logs for this week
    SELECT COALESCE(COUNT(*), 0) INTO v_week_total 
    FROM view_logs2 
    WHERE viewed_at >= v_week_start;
    
    -- Count logs for this month
    SELECT COALESCE(COUNT(*), 0) INTO v_month_total 
    FROM view_logs2 
    WHERE viewed_at >= v_month_start;
    
    -- Calculate final values
    v_yesterday_total := v_base_yesterday + v_yesterday_total;
    v_today_total := v_base_today + v_today_total;
    v_week_total := v_base_week + v_week_total;
    v_month_total := v_base_month + v_month_total;
  END;
  
  -- Log current values before reset
  RAISE NOTICE 'Resetting stats at % (GMT+7)', now() AT TIME ZONE 'Asia/Ho_Chi_Minh';
  RAISE NOTICE 'Yesterday total: %, Today total: %', v_yesterday_total, v_today_total;
  
  -- Step 1: Move today → yesterday
  UPDATE view_stats2 
  SET stat_value = v_today_total, 
      updated_at = now(),
      last_reset_at = now()
  WHERE stat_key = 'yesterday';
  
  -- Step 2: Reset today to 0
  UPDATE view_stats2 
  SET stat_value = 0, 
      updated_at = now(),
      last_reset_at = now()
  WHERE stat_key = 'today';
  
  -- Step 3: Reset week if Monday
  IF v_is_monday THEN
    RAISE NOTICE 'Monday detected - resetting week stats';
    UPDATE view_stats2 
    SET stat_value = 0, 
        updated_at = now(),
        last_reset_at = now()
    WHERE stat_key = 'this_week';
  END IF;
  
  -- Step 4: Reset month if first day
  IF v_is_first_day THEN
    RAISE NOTICE 'First day of month detected - resetting month stats';
    UPDATE view_stats2 
    SET stat_value = 0, 
        updated_at = now(),
        last_reset_at = now()
    WHERE stat_key = 'this_month';
  END IF;
  
  -- Step 5: Delete ONLY logs from PREVIOUS MONTHS (keep ALL logs of current month)
  -- This preserves data for monthly chart display
  DELETE FROM view_logs2 WHERE viewed_at < v_prev_month_start;
  
  RAISE NOTICE 'Reset completed. Kept all logs from % onwards.', v_prev_month_start;
END;
$function$;