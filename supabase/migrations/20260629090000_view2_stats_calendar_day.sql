-- get_view2_stats: đổi "ngày" sang LỊCH THƯỜNG (00:00 → 00:00), thay vì mốc 7h.
--
-- Lý do: mốc 7h→7h khiến lúc 01:00 sáng "Hôm nay" gộp cả ngày hôm trước (~2500
-- view) — phản khoa học. Người dùng kỳ vọng "Hôm nay" lúc 1h sáng chỉ là vài
-- chục view của đêm, tăng dần trong ngày (giống Google Analytics).
--
-- Cách tính mới:
--   • today / yesterday: ĐẾM TRỰC TIẾP view_logs2 theo ngày lịch (00:00 VN).
--     (logs tháng hiện tại được giữ lại nên đếm trực tiếp được, không cần base.)
--   • this_week / this_month / total: vẫn base + log (dữ liệu cũ đã bị xoá log
--     nên cần base cộng dồn), mốc tuần/tháng cũng chuyển về 00:00 cho nhất quán.
--
-- KHÔNG đụng tới: ghi view (frontend insert), cron auto-views, hàm reset (vẫn
-- chạy 7h sáng để chốt base tuần/tháng/tổng — nay today/yesterday đếm trực tiếp
-- nên không phụ thuộc reset nữa).

CREATE OR REPLACE FUNCTION public.get_view2_stats()
RETURNS TABLE(yesterday integer, today integer, this_week integer, this_month integer, total integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_base_this_week INTEGER;
  v_base_this_month INTEGER;
  v_base_total INTEGER;
  v_log_today INTEGER;
  v_log_yesterday INTEGER;
  v_log_this_week INTEGER;
  v_log_this_month INTEGER;
  v_log_total INTEGER;
  v_vn_now TIMESTAMP;
  v_today DATE;
  v_today0 TIMESTAMP WITH TIME ZONE;
  v_yest0 TIMESTAMP WITH TIME ZONE;
  v_week0 TIMESTAMP WITH TIME ZONE;
  v_month0 TIMESTAMP WITH TIME ZONE;
BEGIN
  SELECT COALESCE(stat_value, 0) INTO v_base_this_week  FROM public.view_stats2 WHERE stat_key = 'this_week';
  SELECT COALESCE(stat_value, 0) INTO v_base_this_month FROM public.view_stats2 WHERE stat_key = 'this_month';
  SELECT COALESCE(stat_value, 0) INTO v_base_total      FROM public.view_stats2 WHERE stat_key = 'total';

  v_vn_now := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_today  := DATE(v_vn_now);

  -- Mốc 00:00 (giờ VN) → đổi sang timestamptz để so với viewed_at.
  v_today0 := (v_today + TIME '00:00:00') AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_yest0  := ((v_today - 1) + TIME '00:00:00') AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_week0  := ((v_today - (EXTRACT(ISODOW FROM v_today)::INTEGER - 1)) + TIME '00:00:00') AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_month0 := (DATE_TRUNC('month', v_vn_now)::date + TIME '00:00:00') AT TIME ZONE 'Asia/Ho_Chi_Minh';

  -- today / yesterday: đếm trực tiếp theo ngày lịch.
  SELECT COALESCE(COUNT(*), 0) INTO v_log_today
    FROM public.view_logs2 WHERE viewed_at >= v_today0;
  SELECT COALESCE(COUNT(*), 0) INTO v_log_yesterday
    FROM public.view_logs2 WHERE viewed_at >= v_yest0 AND viewed_at < v_today0;

  -- tuần / tháng / tổng: base + log.
  SELECT COALESCE(COUNT(*), 0) INTO v_log_this_week  FROM public.view_logs2 WHERE viewed_at >= v_week0;
  SELECT COALESCE(COUNT(*), 0) INTO v_log_this_month FROM public.view_logs2 WHERE viewed_at >= v_month0;
  SELECT COALESCE(COUNT(*), 0) INTO v_log_total      FROM public.view_logs2;

  RETURN QUERY SELECT
    v_log_yesterday,
    v_log_today,
    v_base_this_week + v_log_this_week,
    v_base_this_month + v_log_this_month,
    v_base_total + v_log_total;
END;
$function$;
