-- Lịch sử duyệt tin AI: RPC đọc review_log kèm tên người duyệt (join whitelist)
-- cho tab "Lịch sử" ở /duyet-tin-ai. Gate is_submission_allowed — cùng mức
-- nhìn thấy với bảng công duyệt (cả đội xem chung, minh bạch).

CREATE OR REPLACE FUNCTION public.get_review_history(_limit int DEFAULT 100, _only_rejected boolean DEFAULT false)
RETURNS TABLE(
  created_at timestamptz,
  reviewer_name text,
  action text,
  news_title text,
  reason text,
  news_id uuid
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_submission_allowed() THEN
    RAISE EXCEPTION 'Chỉ tài khoản được phép gửi tin mới xem được lịch sử duyệt.';
  END IF;

  RETURN QUERY
  SELECT
    l.created_at,
    COALESCE(w.full_name, p.email, 'Không rõ'),
    l.action,
    l.news_title,
    l.reason,
    l.news_id
  FROM public.review_log l
  LEFT JOIN public.profiles p ON p.id = l.reviewer_id
  LEFT JOIN public.submission_whitelist w ON w.email = lower(p.email)
  WHERE NOT _only_rejected OR l.action = 'reject'
  ORDER BY l.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 100), 1), 500);
END;
$$;

REVOKE ALL ON FUNCTION public.get_review_history(int, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_review_history(int, boolean) TO authenticated;
