-- Create reset_history table to track daily resets
CREATE TABLE public.reset_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reset_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  yesterday_value INTEGER NOT NULL,
  today_value_before_reset INTEGER NOT NULL,
  week_reset BOOLEAN DEFAULT false,
  month_reset BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.reset_history ENABLE ROW LEVEL SECURITY;

-- Allow everyone to read reset history
CREATE POLICY "Reset history readable by everyone"
  ON public.reset_history
  FOR SELECT
  USING (true);

-- Only service role can insert (via edge function)
CREATE POLICY "Reset history insertable by authenticated"
  ON public.reset_history
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Create index for faster queries
CREATE INDEX idx_reset_history_reset_at ON public.reset_history(reset_at DESC);

-- Update reset function to log to reset_history
CREATE OR REPLACE FUNCTION public.reset_daily_view_stats2()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_today_7am TIMESTAMP WITH TIME ZONE;
  v_week_start TIMESTAMP WITH TIME ZONE;
  v_month_start TIMESTAMP WITH TIME ZONE;
  v_prev_month_start TIMESTAMP WITH TIME ZONE;
  v_current_today_calculated INTEGER;
  v_is_monday BOOLEAN;
  v_is_first_day BOOLEAN;
  v_stats_result RECORD;
BEGIN
  -- Calculate time boundaries (7 AM Vietnam time = UTC + 7)
  v_today_7am := (DATE_TRUNC('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'UTC' + INTERVAL '7 hours');
  v_week_start := DATE_TRUNC('week', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'UTC' + INTERVAL '7 hours';
  v_month_start := DATE_TRUNC('month', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'UTC' + INTERVAL '7 hours';
  v_prev_month_start := v_month_start - INTERVAL '1 month';
  
  -- Check if today is Monday or first day of month
  v_is_monday := EXTRACT(ISODOW FROM now() AT TIME ZONE 'Asia/Ho_Chi_Minh') = 1;
  v_is_first_day := EXTRACT(DAY FROM now() AT TIME ZONE 'Asia/Ho_Chi_Minh') = 1;
  
  -- Get CALCULATED "today" value from get_view2_stats()
  SELECT * INTO v_stats_result FROM get_view2_stats() LIMIT 1;
  v_current_today_calculated := COALESCE(v_stats_result.today, 0);
  
  -- Log current values before reset
  RAISE NOTICE 'Resetting stats at % (GMT+7)', now() AT TIME ZONE 'Asia/Ho_Chi_Minh';
  RAISE NOTICE 'Moving today CALCULATED value % to yesterday', v_current_today_calculated;
  
  -- Step 1: Move today's CALCULATED value → yesterday stat_value
  UPDATE view_stats2 
  SET stat_value = v_current_today_calculated, 
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
  
  -- Step 5: Delete ONLY logs from PREVIOUS MONTHS
  DELETE FROM view_logs2 WHERE viewed_at < v_prev_month_start;
  
  -- Step 6: LOG TO reset_history table
  INSERT INTO public.reset_history (
    reset_at,
    yesterday_value,
    today_value_before_reset,
    week_reset,
    month_reset,
    status
  ) VALUES (
    now(),
    v_current_today_calculated,
    v_current_today_calculated,
    v_is_monday,
    v_is_first_day,
    'success'
  );
  
  RAISE NOTICE 'Reset completed and logged. Yesterday preserved at %, today reset to 0', v_current_today_calculated;
  
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