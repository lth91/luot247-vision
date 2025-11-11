-- Fix reset_daily_view_stats2 to calculate yesterday views correctly
-- The issue: get_view2_stats() counts from 7 AM, but reset runs at midnight (00:00)
-- So when reset runs, it gets 0 for "today" because it's before 7 AM

CREATE OR REPLACE FUNCTION public.reset_daily_view_stats2()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_today_7am TIMESTAMP WITH TIME ZONE;
  v_yesterday_7am TIMESTAMP WITH TIME ZONE;
  v_week_start TIMESTAMP WITH TIME ZONE;
  v_month_start TIMESTAMP WITH TIME ZONE;
  v_prev_month_start TIMESTAMP WITH TIME ZONE;
  v_yesterday_view_count INTEGER;
  v_is_monday BOOLEAN;
  v_is_first_day BOOLEAN;
  v_yesterday_date DATE;
  v_vietnam_now TIMESTAMP;
BEGIN
  -- Get current Vietnam time
  v_vietnam_now := now() AT TIME ZONE 'Asia/Ho_Chi_Minh';
  
  -- Calculate time boundaries (7 AM Vietnam time)
  v_today_7am := (DATE_TRUNC('day', v_vietnam_now) + INTERVAL '7 hours') AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_yesterday_7am := v_today_7am - INTERVAL '1 day';
  v_week_start := DATE_TRUNC('week', v_vietnam_now) AT TIME ZONE 'UTC' + INTERVAL '7 hours';
  v_month_start := DATE_TRUNC('month', v_vietnam_now) AT TIME ZONE 'UTC' + INTERVAL '7 hours';
  v_prev_month_start := v_month_start - INTERVAL '1 month';
  
  -- Calculate yesterday's date
  v_yesterday_date := (DATE_TRUNC('day', v_vietnam_now) - INTERVAL '1 day')::DATE;
  
  -- Check if today is Monday or first day of month
  v_is_monday := EXTRACT(ISODOW FROM v_vietnam_now) = 1;
  v_is_first_day := EXTRACT(DAY FROM v_vietnam_now) = 1;
  
  -- COUNT YESTERDAY'S VIEWS DIRECTLY from view_logs2
  -- Yesterday = from yesterday 7 AM to today 7 AM
  SELECT COALESCE(COUNT(*), 0) INTO v_yesterday_view_count
  FROM view_logs2 
  WHERE viewed_at >= v_yesterday_7am AND viewed_at < v_today_7am;
  
  -- Log current values before reset
  RAISE NOTICE 'Resetting stats at % (GMT+7)', v_vietnam_now;
  RAISE NOTICE 'Yesterday views counted from logs: %', v_yesterday_view_count;
  RAISE NOTICE 'Time range: % to %', v_yesterday_7am, v_today_7am;
  
  -- IMPORTANT: Save yesterday's data to daily_view_stats2 BEFORE deleting logs
  PERFORM public.update_daily_view_stats(v_yesterday_date);
  RAISE NOTICE 'Saved yesterday data (%) to daily_view_stats2', v_yesterday_date;
  
  -- Step 1: Move yesterday's counted value → yesterday stat_value
  UPDATE view_stats2 
  SET stat_value = v_yesterday_view_count, 
      updated_at = now(),
      last_reset_at = now()
  WHERE stat_key = 'yesterday';
  
  -- Step 2: Reset today stat_value to 0
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
  
  -- Step 5: Delete ONLY logs from PREVIOUS MONTHS (keeps current month for daily stats)
  DELETE FROM view_logs2 WHERE viewed_at < v_prev_month_start;
  
  -- Step 6: LOG TO reset_history table with CORRECT yesterday value
  INSERT INTO public.reset_history (
    reset_at,
    yesterday_value,
    today_value_before_reset,
    week_reset,
    month_reset,
    status
  ) VALUES (
    now(),
    v_yesterday_view_count,
    v_yesterday_view_count,
    v_is_monday,
    v_is_first_day,
    'success'
  );
  
  RAISE NOTICE 'Reset completed and logged. Yesterday: %, today reset to 0', v_yesterday_view_count;
  
EXCEPTION
  WHEN OTHERS THEN
    -- Log error to reset_history
    INSERT INTO public.reset_history (
      reset_at,
      yesterday_value,
      today_value_before_reset,
      week_reset,
      month_reset,
      status,
      error_message
    ) VALUES (
      now(),
      0,
      0,
      v_is_monday,
      v_is_first_day,
      'error',
      SQLERRM
    );
    
    RAISE;
END;
$$;