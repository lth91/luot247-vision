-- Bảng theo dõi gửi tin: thêm cột "Duyệt hôm qua" (acc_yesterday) theo yêu cầu
-- sếp 09/07. Đổi return type nên phải DROP trước (CREATE OR REPLACE không cho
-- đổi RETURNS TABLE).

DROP FUNCTION IF EXISTS public.get_submission_dashboard();

CREATE FUNCTION public.get_submission_dashboard()
RETURNS TABLE(
  full_name text,
  email text,
  sub_today int,
  sub_month int,
  acc_today int,
  acc_yesterday int,
  acc_month int,
  acc_prev_month int,
  yellow_cards int,
  red_cards int,
  banned boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vn_now timestamp;
  v_today0 timestamptz;
  v_yest0  timestamptz;
  v_month0 timestamptz;
  v_prev0  timestamptz;
BEGIN
  IF NOT public.is_submission_allowed() THEN
    RAISE EXCEPTION 'Chỉ tài khoản được phép gửi tin mới xem được bảng theo dõi.';
  END IF;

  v_vn_now := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_today0 := (DATE(v_vn_now) + TIME '00:00:00') AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_yest0  := ((DATE(v_vn_now) - 1) + TIME '00:00:00') AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_month0 := (DATE_TRUNC('month', v_vn_now)::date + TIME '00:00:00') AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_prev0  := ((DATE_TRUNC('month', v_vn_now) - INTERVAL '1 month')::date + TIME '00:00:00') AT TIME ZONE 'Asia/Ho_Chi_Minh';

  RETURN QUERY
  SELECT
    w.full_name,
    w.email,
    -- sub_*: đếm TIN thật (DISTINCT tiêu đề) — giữ nguyên logic 20260709010000
    COUNT(DISTINCT COALESCE(lower(l.title), l.id::text)) FILTER (WHERE l.created_at >= v_today0 AND l.status <> 'error')::int,
    COUNT(DISTINCT COALESCE(lower(l.title), l.id::text)) FILTER (WHERE l.created_at >= v_month0 AND l.status <> 'error')::int,
    COUNT(l.id) FILTER (WHERE l.created_at >= v_today0 AND l.status = 'accepted')::int,
    COUNT(l.id) FILTER (WHERE l.created_at >= v_yest0 AND l.created_at < v_today0 AND l.status = 'accepted')::int,
    COUNT(l.id) FILTER (WHERE l.created_at >= v_month0 AND l.status = 'accepted')::int,
    COUNT(l.id) FILTER (WHERE l.created_at >= v_prev0 AND l.created_at < v_month0 AND l.status = 'accepted')::int,
    COALESCE(c.yellow, 0)::int,
    COALESCE(c.red, 0)::int,
    COALESCE(p.submission_banned, false)
  FROM public.submission_whitelist w
  LEFT JOIN public.profiles p ON lower(p.email) = w.email
  LEFT JOIN public.submission_log l ON l.user_id = p.id AND l.created_at >= v_prev0
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE nc.card_type = 'yellow') AS yellow,
           COUNT(*) FILTER (WHERE nc.card_type = 'red') AS red
    FROM public.news_cards nc
    WHERE nc.author_id = p.id AND nc.status = 'approved'
  ) c ON true
  GROUP BY w.full_name, w.email, c.yellow, c.red, p.submission_banned
  ORDER BY 7 DESC, w.full_name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_submission_dashboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_submission_dashboard() TO authenticated;
