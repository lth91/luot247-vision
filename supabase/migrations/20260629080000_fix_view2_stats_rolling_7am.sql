-- Sửa get_view2_stats: mốc "ngày" chạy theo 7h sáng→7h sáng (rolling), không
-- theo ngày dương lịch.
--
-- BUG: cũ tính today_7am = 7h sáng của DATE(now). Trong khung 00:00–07:00, lịch
-- đã sang ngày mới nên 7h-sáng-hôm-nay nằm ở TƯƠNG LAI → đếm view_logs2 có
-- viewed_at >= mốc-tương-lai = 0 → thẻ "Hôm nay" = 0 suốt 00:00–07:00, dù
-- auto-views 24/7 vẫn ghi view ban đêm. (Trước đây auto-views chỉ chạy 7h–22h
-- nên không lộ; từ khi chạy 24/7 thì khung đêm rơi vào "vùng chết".)
--
-- FIX: nếu giờ VN < 07:00 thì bucket vẫn thuộc NGÀY HÔM TRƯỚC → lấy 7h sáng
-- hôm qua làm mốc. Khớp với reset chạy lúc 7h sáng (reset đếm yesterday theo
-- [hôm-qua 7h, hôm-nay 7h)), nên view đêm 00:00–07:00 hiện vào "Hôm nay" rồi
-- được gộp vào "Hôm qua" tại lần reset 7h. Không đổi gì khác (gửi/ghi view).

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
  v_log_today INTEGER;
  v_log_this_week INTEGER;
  v_log_this_month INTEGER;
  v_log_total INTEGER;
  v_today_7am TIMESTAMP WITH TIME ZONE;
  v_week_start TIMESTAMP WITH TIME ZONE;
  v_month_start TIMESTAMP WITH TIME ZONE;
  v_vietnam_now TIMESTAMP;
  v_bucket_date DATE;
BEGIN
  -- Base values từ view_stats2
  SELECT COALESCE(stat_value, 0) INTO v_base_yesterday FROM public.view_stats2 WHERE stat_key = 'yesterday';
  SELECT COALESCE(stat_value, 0) INTO v_base_today FROM public.view_stats2 WHERE stat_key = 'today';
  SELECT COALESCE(stat_value, 0) INTO v_base_this_week FROM public.view_stats2 WHERE stat_key = 'this_week';
  SELECT COALESCE(stat_value, 0) INTO v_base_this_month FROM public.view_stats2 WHERE stat_key = 'this_month';
  SELECT COALESCE(stat_value, 0) INTO v_base_total FROM public.view_stats2 WHERE stat_key = 'total';

  v_vietnam_now := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh');

  -- Ngày chạy theo mốc 7h sáng. Trước 7h sáng vẫn thuộc bucket NGÀY HÔM TRƯỚC.
  v_bucket_date := CASE
    WHEN v_vietnam_now::time < TIME '07:00:00' THEN DATE(v_vietnam_now) - 1
    ELSE DATE(v_vietnam_now)
  END;

  v_today_7am  := (v_bucket_date + TIME '07:00:00') AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_week_start := ((v_bucket_date - (EXTRACT(ISODOW FROM v_bucket_date)::INTEGER - 1)) + TIME '07:00:00') AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_month_start := (DATE_TRUNC('month', v_bucket_date::timestamp)::date + TIME '07:00:00') AT TIME ZONE 'Asia/Ho_Chi_Minh';

  -- Đếm log mới (sau mốc bucket)
  SELECT COALESCE(COUNT(*), 0) INTO v_log_today     FROM public.view_logs2 WHERE viewed_at >= v_today_7am;
  SELECT COALESCE(COUNT(*), 0) INTO v_log_this_week FROM public.view_logs2 WHERE viewed_at >= v_week_start;
  SELECT COALESCE(COUNT(*), 0) INTO v_log_this_month FROM public.view_logs2 WHERE viewed_at >= v_month_start;
  SELECT COALESCE(COUNT(*), 0) INTO v_log_total     FROM public.view_logs2;

  RETURN QUERY SELECT
    v_base_yesterday,                       -- yesterday: chỉ từ base (đã chốt tại reset)
    v_base_today + v_log_today,
    v_base_this_week + v_log_this_week,
    v_base_this_month + v_log_this_month,
    v_base_total + v_log_total;
END;
$function$;
