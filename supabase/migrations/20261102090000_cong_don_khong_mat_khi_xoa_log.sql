-- 02/11: "Cộng dồn" ở /viewcount tụt mỗi ngày mùng 1 (31/10 ~354.000 → 01/11
-- ~251.000). get_view2_stats() tính total = view_stats2.total (gốc 102.971, cố
-- định từ 11/2025) + COUNT(view_logs2). reset_daily_view_stats2 mỗi đêm xoá log
-- cũ hơn đầu tháng trước nhưng KHÔNG cộng số bị xoá vào gốc → mỗi mùng 1 mất
-- nguyên một tháng view.
--
-- Sửa:
-- 1. Bước 5 của reset_daily_view_stats2: xoá log và cộng đúng số dòng vừa xoá
--    vào view_stats2.total trong CÙNG một câu lệnh (DELETE … RETURNING). Hàm này
--    bị gọi 2 lần lúc 00:00 UTC (cron reset-daily-view-stats2 + daily-auto-views
--    khung 7h) — lần thứ hai chỉ đếm được dòng nó thật sự xoá, nên không cộng đúp.
-- 2. Khôi phục một lần: cộng lại 108.501 view tháng 9 (tổng daily_view_stats2
--    tháng 9) đã mất ngày 01/11 — phương án 1 anh Long chọn (đưa về mức trước
--    khi tụt, không dựng lại tổng thật ~981.000 từ 11/2025).
--
-- Đã chạy trực tiếp 02/11.
--
-- HOÀN TÁC phần khôi phục (nếu cần):
--   UPDATE public.view_stats2 SET stat_value = stat_value - 108501, updated_at = now()
--    WHERE stat_key = 'total';

CREATE OR REPLACE FUNCTION public.reset_daily_view_stats2()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
  v_purged INTEGER;
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

  -- Step 5: Delete ONLY logs from PREVIOUS MONTHS (keeps current month for daily stats).
  -- Số dòng xoá được cộng vào gốc 'total' trong cùng câu lệnh → "Cộng dồn" không tụt.
  WITH purged AS (
    DELETE FROM view_logs2 WHERE viewed_at < v_prev_month_start RETURNING 1
  ), cnt AS (
    SELECT COUNT(*)::INTEGER AS n FROM purged
  ), bump AS (
    UPDATE view_stats2
       SET stat_value = stat_value + (SELECT n FROM cnt),
           updated_at = now()
     WHERE stat_key = 'total' AND (SELECT n FROM cnt) > 0
  )
  SELECT n INTO v_purged FROM cnt;
  IF v_purged > 0 THEN
    RAISE NOTICE 'Purged % old logs, folded into total', v_purged;
  END IF;

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
$function$;

UPDATE public.view_stats2
   SET stat_value = stat_value + 108501, updated_at = now()
 WHERE stat_key = 'total';
