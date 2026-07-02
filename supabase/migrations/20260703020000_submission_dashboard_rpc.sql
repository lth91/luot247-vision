-- RPC cho "Bảng theo dõi gửi tin" (/bang-xep-hang): mỗi nhân viên whitelist
-- 1 dòng — tin GỬI (sub_*, mọi status trừ 'error') và tin ĐƯỢC DUYỆT/đăng
-- (acc_*, status='accepted') theo hôm nay / tháng này / tháng trước (giờ VN).
-- Guard bằng is_submission_allowed() → chỉ whitelist + admin gọi được (bảng
-- whitelist + submission_log đều bị RLS chặn đọc chéo, phải qua RPC này).
-- Người trong whitelist chưa đăng ký tài khoản → các cột đều 0.
-- Thẻ vàng/thẻ đỏ CHƯA có cơ chế — frontend tự hiện 0, không trả từ đây.

CREATE OR REPLACE FUNCTION public.get_submission_dashboard()
RETURNS TABLE(
  full_name text,
  email text,
  sub_today int,
  sub_month int,
  acc_today int,
  acc_month int,
  acc_prev_month int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vn_now timestamp;
  v_today0 timestamptz;
  v_month0 timestamptz;
  v_prev0  timestamptz;
BEGIN
  IF NOT public.is_submission_allowed() THEN
    RAISE EXCEPTION 'Chỉ tài khoản được phép gửi tin mới xem được bảng theo dõi.';
  END IF;

  -- Mốc 00:00 giờ VN (pattern như get_view2_stats, migration 20260629090000).
  v_vn_now := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_today0 := (DATE(v_vn_now) + TIME '00:00:00') AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_month0 := (DATE_TRUNC('month', v_vn_now)::date + TIME '00:00:00') AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_prev0  := ((DATE_TRUNC('month', v_vn_now) - INTERVAL '1 month')::date + TIME '00:00:00') AT TIME ZONE 'Asia/Ho_Chi_Minh';

  RETURN QUERY
  SELECT
    w.full_name,
    w.email,
    COUNT(l.id) FILTER (WHERE l.created_at >= v_today0 AND l.status <> 'error')::int,
    COUNT(l.id) FILTER (WHERE l.created_at >= v_month0 AND l.status <> 'error')::int,
    COUNT(l.id) FILTER (WHERE l.created_at >= v_today0 AND l.status = 'accepted')::int,
    COUNT(l.id) FILTER (WHERE l.created_at >= v_month0 AND l.status = 'accepted')::int,
    COUNT(l.id) FILTER (WHERE l.created_at >= v_prev0 AND l.created_at < v_month0 AND l.status = 'accepted')::int
  FROM public.submission_whitelist w
  LEFT JOIN public.profiles p ON lower(p.email) = w.email
  LEFT JOIN public.submission_log l ON l.user_id = p.id AND l.created_at >= v_prev0
  GROUP BY w.full_name, w.email
  ORDER BY 6 DESC, w.full_name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_submission_dashboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_submission_dashboard() TO authenticated;
