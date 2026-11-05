-- 06/11: Bảng Thống kê (/bang-xep-hang) vẫn báo "Chưa có dữ liệu" cả lúc
-- vắng (23h). get_submission_dashboard đếm COUNT(DISTINCT) 6 lần trên toàn bộ
-- submission_log từ đầu tháng trước (~375.000 dòng, tăng dần tới cuối tháng)
-- → 3–8s mỗi lần mở trang, chạm trần 8s statement_timeout của PostgREST.
--
-- Sửa: TÍNH SẴN. Cron 5 phút/lần chạy refresh_submission_dashboard_cache()
-- (chạy bằng postgres, không vướng trần 8s) ghi kết quả vào
-- submission_dashboard_cache; get_submission_dashboard chỉ đọc bảng này
-- (vẫn kiểm tra quyền như cũ). Số liệu chậm tối đa ~5 phút. Cache rỗng
-- (lần đầu) → tính trực tiếp như cũ.

CREATE TABLE IF NOT EXISTS public.submission_dashboard_cache (
  sort_order int NOT NULL,
  full_name text, email text,
  sub_today int, sub_month int, acc_today int, acc_yesterday int,
  acc_month int, acc_prev_month int, yellow_cards int, red_cards int,
  banned boolean,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.submission_dashboard_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.submission_dashboard_cache FROM anon, authenticated;

-- Phần tính toán nguyên văn từ get_submission_dashboard cũ, bỏ kiểm tra quyền
-- (chỉ cron/postgres gọi; không cấp cho anon/authenticated).
CREATE OR REPLACE FUNCTION public.compute_submission_dashboard()
 RETURNS TABLE(full_name text, email text, sub_today integer, sub_month integer, acc_today integer, acc_yesterday integer, acc_month integer, acc_prev_month integer, yellow_cards integer, red_cards integer, banned boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_vn_now timestamp;
  v_today0 timestamptz;
  v_yest0  timestamptz;
  v_month0 timestamptz;
  v_prev0  timestamptz;
BEGIN
  v_vn_now := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_today0 := (DATE(v_vn_now) + TIME '00:00:00') AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_yest0  := ((DATE(v_vn_now) - 1) + TIME '00:00:00') AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_month0 := (DATE_TRUNC('month', v_vn_now)::date + TIME '00:00:00') AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_prev0  := ((DATE_TRUNC('month', v_vn_now) - INTERVAL '1 month')::date + TIME '00:00:00') AT TIME ZONE 'Asia/Ho_Chi_Minh';

  RETURN QUERY
  SELECT
    w.full_name,
    COALESCE(w.email_alias, w.email),
    COUNT(DISTINCT COALESCE(lower(l.title), l.id::text)) FILTER (WHERE l.created_at >= v_today0 AND l.status <> 'error')::int,
    COUNT(DISTINCT COALESCE(lower(l.title), l.id::text)) FILTER (WHERE l.created_at >= v_month0 AND l.status <> 'error')::int,
    COUNT(DISTINCT COALESCE(lower(l.title), l.id::text)) FILTER (WHERE l.created_at >= v_today0 AND l.status = 'accepted')::int,
    COUNT(DISTINCT COALESCE(lower(l.title), l.id::text)) FILTER (WHERE l.created_at >= v_yest0 AND l.created_at < v_today0 AND l.status = 'accepted')::int,
    COUNT(DISTINCT COALESCE(lower(l.title), l.id::text)) FILTER (WHERE l.created_at >= v_month0 AND l.status = 'accepted')::int,
    COUNT(DISTINCT COALESCE(lower(l.title), l.id::text)) FILTER (WHERE l.created_at >= v_prev0 AND l.created_at < v_month0 AND l.status = 'accepted')::int,
    (SELECT COUNT(*)::int FROM public.news_cards nc JOIN public.profiles p2 ON nc.author_id = p2.id
      WHERE lower(p2.email) IN (w.email, w.email_alias) AND nc.status = 'approved' AND nc.card_type = 'yellow'),
    (SELECT COUNT(*)::int FROM public.news_cards nc JOIN public.profiles p2 ON nc.author_id = p2.id
      WHERE lower(p2.email) IN (w.email, w.email_alias) AND nc.status = 'approved' AND nc.card_type = 'red'),
    COALESCE(bool_or(p.submission_banned), false)
  FROM public.submission_whitelist w
  LEFT JOIN public.profiles p ON lower(p.email) IN (w.email, w.email_alias)
  LEFT JOIN public.submission_log l ON l.user_id = p.id AND l.created_at >= v_prev0
  GROUP BY w.full_name, w.email, w.email_alias
  ORDER BY 7 DESC, w.full_name;
END;
$function$;
REVOKE ALL ON FUNCTION public.compute_submission_dashboard() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.refresh_submission_dashboard_cache()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  CREATE TEMP TABLE _dash ON COMMIT DROP AS
    SELECT row_number() OVER () ::int AS sort_order, d.* FROM public.compute_submission_dashboard() d;
  DELETE FROM public.submission_dashboard_cache;
  INSERT INTO public.submission_dashboard_cache
    (sort_order, full_name, email, sub_today, sub_month, acc_today, acc_yesterday,
     acc_month, acc_prev_month, yellow_cards, red_cards, banned, refreshed_at)
  SELECT sort_order, full_name, email, sub_today, sub_month, acc_today, acc_yesterday,
     acc_month, acc_prev_month, yellow_cards, red_cards, banned, now() FROM _dash;
END;
$function$;
REVOKE ALL ON FUNCTION public.refresh_submission_dashboard_cache() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_submission_dashboard()
 RETURNS TABLE(full_name text, email text, sub_today integer, sub_month integer, acc_today integer, acc_yesterday integer, acc_month integer, acc_prev_month integer, yellow_cards integer, red_cards integer, banned boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_submission_allowed() THEN
    RAISE EXCEPTION 'Chỉ tài khoản được phép gửi tin mới xem được bảng theo dõi.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.submission_dashboard_cache) THEN
    RETURN QUERY
    SELECT c.full_name, c.email, c.sub_today, c.sub_month, c.acc_today, c.acc_yesterday,
           c.acc_month, c.acc_prev_month, c.yellow_cards, c.red_cards, c.banned
    FROM public.submission_dashboard_cache c
    ORDER BY c.sort_order;
  ELSE
    RETURN QUERY SELECT * FROM public.compute_submission_dashboard();
  END IF;
END;
$function$;

SELECT public.refresh_submission_dashboard_cache();
SELECT cron.schedule('submission-dashboard-refresh', '*/5 * * * *',
  'SELECT public.refresh_submission_dashboard_cache()');
