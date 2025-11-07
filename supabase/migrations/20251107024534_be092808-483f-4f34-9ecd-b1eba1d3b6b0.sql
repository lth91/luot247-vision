-- Fix reset_daily_view_stats2 to preserve yesterday's full count
CREATE OR REPLACE FUNCTION public.reset_daily_view_stats2()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_today_7am TIMESTAMP WITH TIME ZONE;
  v_week_start TIMESTAMP WITH TIME ZONE;
  v_month_start TIMESTAMP WITH TIME ZONE;
  v_prev_month_start TIMESTAMP WITH TIME ZONE;
  v_current_today_value INTEGER;
  v_is_monday BOOLEAN;
  v_is_first_day BOOLEAN;
BEGIN
  -- Calculate time boundaries (7 AM Vietnam time = UTC + 7)
  v_today_7am := (DATE_TRUNC('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'UTC' + INTERVAL '7 hours');
  v_week_start := DATE_TRUNC('week', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'UTC' + INTERVAL '7 hours';
  v_month_start := DATE_TRUNC('month', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'UTC' + INTERVAL '7 hours';
  v_prev_month_start := v_month_start - INTERVAL '1 month';
  
  -- Check if today is Monday or first day of month
  v_is_monday := EXTRACT(ISODOW FROM now() AT TIME ZONE 'Asia/Ho_Chi_Minh') = 1;
  v_is_first_day := EXTRACT(DAY FROM now() AT TIME ZONE 'Asia/Ho_Chi_Minh') = 1;
  
  -- Get current "today" value (this is yesterday's full count)
  SELECT COALESCE(stat_value, 0) INTO v_current_today_value 
  FROM view_stats2 
  WHERE stat_key = 'today';
  
  -- Log current values before reset
  RAISE NOTICE 'Resetting stats at % (GMT+7)', now() AT TIME ZONE 'Asia/Ho_Chi_Minh';
  RAISE NOTICE 'Moving today value % to yesterday', v_current_today_value;
  
  -- Step 1: Move today → yesterday (preserve full count)
  UPDATE view_stats2 
  SET stat_value = v_current_today_value, 
      updated_at = now(),
      last_reset_at = now()
  WHERE stat_key = 'yesterday';
  
  -- Step 2: Reset today to 0 (will accumulate from 7 AM onwards)
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
  DELETE FROM view_logs2 WHERE viewed_at < v_prev_month_start;
  
  RAISE NOTICE 'Reset completed. Yesterday preserved at %, today reset to 0', v_current_today_value;
END;
$$;