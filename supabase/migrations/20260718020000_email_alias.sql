-- Email gọn theo danh sách sếp 18/07 (DANH SÁCH ĐĂNG KÝ EMAIL GỬI TIN):
-- thêm cột email_alias — bảng Thống kê hiển thị email MỚI (gọn), đăng nhập
-- chấp nhận CẢ HAI email, số liệu gửi/duyệt của 2 tài khoản gộp về 1 dòng.
-- 14 người đổi email, 18 người giữ nguyên (alias NULL).

ALTER TABLE public.submission_whitelist ADD COLUMN IF NOT EXISTS email_alias text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_submission_whitelist_alias
  ON public.submission_whitelist (email_alias) WHERE email_alias IS NOT NULL;

UPDATE public.submission_whitelist SET email_alias = v.alias
FROM (VALUES
  ('bui.thi.na.denco@gmail.com',            'bui.na.denco@gmail.com'),
  ('pham.phuong.dung.denco@gmail.com',      'phuong.dung.denco@gmail.com'),
  ('nguyen.kieu.tuan.denco@gmail.com',      'kieu.tuan.denco@gmail.com'),
  ('nguyen.trungthanh.denco@gmail.com',     'trung.thanh.denco@gmail.com'),
  ('luong.phuong.diep.denco@gmail.com',     'phuong.diep.denco@gmail.com'),
  ('luong.thi.thao.denco@gmail.com',        'thi.thao.denco@gmail.com'),
  ('vu.hoang.minh.anh.denco@gmail.com',     'vu.anh.denco@gmail.com'),
  ('nguyen.thanh.thao.denco@gmail.com',     'thanh.thao.denco@gmail.com'),
  ('luong.huyen.mai.denco@gmail.com',       'luong.mai.denco@gmail.com'),
  ('nguyen.ngoc.phuong.linh.denco@gmail.com','phuong.linh.denco@gmail.com'),
  ('nguyen.h.trang.denco@gmail.com',        'huyen.trang.denco@gmail.com'),
  ('vu.thai.duong.denco@gmail.com',         'vu.duong.denco@gmail.com'),
  ('doan.tran.minh.phuc.denco@gmail.com',   'doan.phuc.denco@gmail.com'),
  ('nguyen.giap.thu.thuy.denco@gmail.com',  'thu.thuy.denco@gmail.com')
) AS v(email, alias)
WHERE submission_whitelist.email = v.email;

-- ===== Đăng nhập: chấp nhận cả email chính lẫn email phụ =====
CREATE OR REPLACE FUNCTION public.is_submission_allowed()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.submission_whitelist w
    WHERE lower(coalesce(auth.jwt() ->> 'email', '')) IN (w.email, w.email_alias)
  ) OR public.has_role(auth.uid(), 'admin');
$$;

-- ===== Bảng gửi tin: hiển thị email gọn + gộp số liệu 2 tài khoản =====
CREATE OR REPLACE FUNCTION public.get_submission_dashboard()
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
$$;

-- ===== Bảng công duyệt tin AI: cùng cách gộp + cùng email hiển thị =====
-- (email trả về phải TRÙNG với bảng gửi tin để frontend ghép 2 nguồn theo email)
CREATE OR REPLACE FUNCTION public.get_review_dashboard()
RETURNS TABLE(
  full_name text,
  email text,
  duyet_today int,
  loai_today int,
  duyet_yesterday int,
  duyet_month int,
  loai_month int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vn_now timestamp;
  v_today0 timestamptz;
  v_yest0  timestamptz;
  v_month0 timestamptz;
BEGIN
  IF NOT public.is_submission_allowed() THEN
    RAISE EXCEPTION 'Chỉ tài khoản được phép gửi tin mới xem được bảng công duyệt.';
  END IF;

  v_vn_now := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_today0 := (DATE(v_vn_now) + TIME '00:00:00') AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_yest0  := ((DATE(v_vn_now) - 1) + TIME '00:00:00') AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_month0 := (DATE_TRUNC('month', v_vn_now)::date + TIME '00:00:00') AT TIME ZONE 'Asia/Ho_Chi_Minh';

  RETURN QUERY
  SELECT
    w.full_name,
    COALESCE(w.email_alias, w.email),
    COUNT(l.id) FILTER (WHERE l.created_at >= v_today0 AND l.action <> 'reject')::int,
    COUNT(l.id) FILTER (WHERE l.created_at >= v_today0 AND l.action = 'reject')::int,
    COUNT(l.id) FILTER (WHERE l.created_at >= v_yest0 AND l.created_at < v_today0 AND l.action <> 'reject')::int,
    COUNT(l.id) FILTER (WHERE l.created_at >= v_month0 AND l.action <> 'reject')::int,
    COUNT(l.id) FILTER (WHERE l.created_at >= v_month0 AND l.action = 'reject')::int
  FROM public.submission_whitelist w
  LEFT JOIN public.profiles p ON lower(p.email) IN (w.email, w.email_alias)
  LEFT JOIN public.review_log l ON l.reviewer_id = p.id AND l.created_at >= v_month0
  GROUP BY w.full_name, w.email, w.email_alias
  ORDER BY 6 DESC, w.full_name;
END;
$$;
