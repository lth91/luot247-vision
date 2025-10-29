-- Fix get_view2_stats function - sửa logic tính toán 7AM GMT+7
CREATE OR REPLACE FUNCTION public.get_view2_stats()
RETURNS TABLE(yesterday integer, today integer, this_week integer, this_month integer, total integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
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
  v_vietnam_now TIMESTAMP;
  v_vietnam_today DATE;
BEGIN
  -- Get base values from view_stats2
  SELECT COALESCE(stat_value, 0) INTO v_base_yesterday FROM public.view_stats2 WHERE stat_key = 'yesterday';
  SELECT COALESCE(stat_value, 0) INTO v_base_today FROM public.view_stats2 WHERE stat_key = 'today';
  SELECT COALESCE(stat_value, 0) INTO v_base_this_week FROM public.view_stats2 WHERE stat_key = 'this_week';
  SELECT COALESCE(stat_value, 0) INTO v_base_this_month FROM public.view_stats2 WHERE stat_key = 'this_month';
  SELECT COALESCE(stat_value, 0) INTO v_base_total FROM public.view_stats2 WHERE stat_key = 'total';
  
  -- Get current time in Vietnam timezone
  v_vietnam_now := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_vietnam_today := DATE(v_vietnam_now);
  
  -- Calculate 7 AM today in Vietnam, then convert back to UTC for comparison
  v_today_7am := (v_vietnam_today + TIME '07:00:00') AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_yesterday_7am := v_today_7am - INTERVAL '1 day';
  
  -- Week start: Monday 7 AM of current week
  v_week_start := ((v_vietnam_today - (EXTRACT(ISODOW FROM v_vietnam_today)::INTEGER - 1)) + TIME '07:00:00') AT TIME ZONE 'Asia/Ho_Chi_Minh';
  
  -- Month start: First day of month at 7 AM
  v_month_start := (DATE_TRUNC('month', v_vietnam_now)::DATE + TIME '07:00:00') AT TIME ZONE 'Asia/Ho_Chi_Minh';
  
  -- Count logs from view_logs2
  SELECT COALESCE(COUNT(*), 0) INTO v_log_today FROM public.view_logs2 WHERE viewed_at >= v_today_7am;
  SELECT COALESCE(COUNT(*), 0) INTO v_log_yesterday FROM public.view_logs2 WHERE viewed_at >= v_yesterday_7am AND viewed_at < v_today_7am;
  SELECT COALESCE(COUNT(*), 0) INTO v_log_this_week FROM public.view_logs2 WHERE viewed_at >= v_week_start;
  SELECT COALESCE(COUNT(*), 0) INTO v_log_this_month FROM public.view_logs2 WHERE viewed_at >= v_month_start;
  SELECT COALESCE(COUNT(*), 0) INTO v_log_total FROM public.view_logs2;
  
  -- Return combined results
  RETURN QUERY SELECT
    v_base_yesterday + v_log_yesterday,
    v_base_today + v_log_today,
    v_base_this_week + v_log_this_week,
    v_base_this_month + v_log_this_month,
    v_base_total + v_log_total;
END;
$function$;