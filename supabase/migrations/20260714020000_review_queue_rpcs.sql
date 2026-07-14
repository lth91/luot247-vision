-- PR2 pipeline AI crawl: RPC duyệt/loại tin trong hàng đợi + bảng công duyệt.
-- Nhân viên whitelist KHÔNG có quyền UPDATE news qua RLS (chỉ admin/moderator),
-- nên mọi thao tác duyệt đi qua RPC SECURITY DEFINER có gate is_submission_allowed().
--
-- Chốt an toàn:
--   • Optimistic lock: UPDATE ... WHERE review_status='pending' — 2 người cùng
--     duyệt 1 tin thì người sau nhận lỗi "đã được xử lý".
--   • Chỉ đụng tin AI crawl (submitted_by IS NULL) — tin nhân viên gửi tay
--     nằm ngoài phạm vi RPC này.
--   • Duyệt có sửa: validate chuẩn từ (tiêu đề 12-18, tổng 120-140) ngay trong
--     RPC để tin lệch chuẩn không lọt lên trang.
--   • Loại KHÔNG xóa row (url_hash tiếp tục chặn crawler re-insert).

-- ===== 1) Bảng công duyệt =====
CREATE TABLE IF NOT EXISTS public.review_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  news_id uuid REFERENCES public.news(id) ON DELETE SET NULL,
  news_title text NOT NULL,          -- snapshot: tin có thể bị purge sau
  action text NOT NULL CHECK (action IN ('approve', 'approve_edited', 'reject')),
  reason text,                       -- lý do loại (approve thì NULL)
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_log_reviewer_time
  ON public.review_log (reviewer_id, created_at DESC);

ALTER TABLE public.review_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Reviewers see own review log" ON public.review_log
  FOR SELECT TO authenticated USING (reviewer_id = auth.uid());
CREATE POLICY "Admins see all review log" ON public.review_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));
-- Ghi: chỉ qua RPC SECURITY DEFINER / service role — không mở policy INSERT.

-- ===== 2) Helper đếm từ (khớp countWords = split(/\s+/) của frontend/edge) =====
CREATE OR REPLACE FUNCTION public.count_words(_s text)
RETURNS int
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN trim(COALESCE(_s, '')) = '' THEN 0
    ELSE array_length(regexp_split_to_array(trim(_s), '\s+'), 1)
  END;
$$;

-- ===== 3) RPC duyệt =====
CREATE OR REPLACE FUNCTION public.approve_crawled_news(
  _news_id uuid,
  _title text DEFAULT NULL,
  _content text DEFAULT NULL,
  _category text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_edited boolean;
  v_final_title text;
  v_final_content text;
  v_tw int;
  v_total int;
  v_cat public.news_category;
BEGIN
  IF NOT public.is_submission_allowed() THEN
    RAISE EXCEPTION 'Chỉ tài khoản được phép gửi tin mới được duyệt tin AI.';
  END IF;

  SELECT COALESCE(_title, n.title), COALESCE(_content, n.description)
    INTO v_final_title, v_final_content
  FROM public.news n
  WHERE n.id = _news_id AND n.review_status = 'pending' AND n.submitted_by IS NULL;
  IF v_final_title IS NULL THEN
    RAISE EXCEPTION 'Tin không còn trong hàng đợi (đã được người khác xử lý?).';
  END IF;

  -- Chuẩn độ dài áp cho bản CUỐI CÙNG lên trang (kể cả khi không sửa gì —
  -- tin needs_edit bắt buộc phải sửa mới duyệt được).
  v_tw := public.count_words(v_final_title);
  v_total := v_tw + public.count_words(v_final_content);
  IF v_tw < 12 OR v_tw > 18 THEN
    RAISE EXCEPTION 'Tiêu đề % từ — chuẩn 12-18 từ. Hãy bấm Sửa trước khi duyệt.', v_tw;
  END IF;
  IF v_total < 120 OR v_total > 140 THEN
    RAISE EXCEPTION 'Tổng % từ — chuẩn 120-140 từ. Hãy bấm Sửa trước khi duyệt.', v_total;
  END IF;

  IF _category IS NOT NULL THEN
    BEGIN
      v_cat := _category::public.news_category;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Chuyên mục không hợp lệ: %', _category;
    END;
  END IF;

  UPDATE public.news SET
    title = v_final_title,
    description = v_final_content,
    category = COALESCE(v_cat, category),
    is_approved = true,
    review_status = 'approved',
    reviewed_by = auth.uid(),
    reviewed_at = now()
  WHERE id = _news_id AND review_status = 'pending' AND submitted_by IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tin không còn trong hàng đợi (đã được người khác xử lý?).';
  END IF;

  v_edited := _title IS NOT NULL OR _content IS NOT NULL OR _category IS NOT NULL;
  INSERT INTO public.review_log (reviewer_id, news_id, news_title, action)
  VALUES (auth.uid(), _news_id, v_final_title, CASE WHEN v_edited THEN 'approve_edited' ELSE 'approve' END);

  RETURN jsonb_build_object('ok', true, 'edited', v_edited);
END;
$$;

-- ===== 4) RPC loại =====
CREATE OR REPLACE FUNCTION public.reject_crawled_news(_news_id uuid, _reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title text;
BEGIN
  IF NOT public.is_submission_allowed() THEN
    RAISE EXCEPTION 'Chỉ tài khoản được phép gửi tin mới được loại tin AI.';
  END IF;
  IF trim(COALESCE(_reason, '')) = '' THEN
    RAISE EXCEPTION 'Cần chọn/nhập lý do loại.';
  END IF;

  UPDATE public.news SET
    review_status = 'rejected',
    reviewed_by = auth.uid(),
    reviewed_at = now()
  WHERE id = _news_id AND review_status = 'pending' AND submitted_by IS NULL
  RETURNING title INTO v_title;
  IF v_title IS NULL THEN
    RAISE EXCEPTION 'Tin không còn trong hàng đợi (đã được người khác xử lý?).';
  END IF;

  INSERT INTO public.review_log (reviewer_id, news_id, news_title, action, reason)
  VALUES (auth.uid(), _news_id, v_title, 'reject', trim(_reason));

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ===== 5) Bảng công duyệt cho dashboard =====
CREATE OR REPLACE FUNCTION public.get_review_dashboard()
RETURNS TABLE(
  full_name text,
  email text,
  duyet_today int,
  loai_today int,
  duyet_month int,
  loai_month int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vn_now timestamp;
  v_today0 timestamptz;
  v_month0 timestamptz;
BEGIN
  IF NOT public.is_submission_allowed() THEN
    RAISE EXCEPTION 'Chỉ tài khoản được phép gửi tin mới xem được bảng công duyệt.';
  END IF;

  v_vn_now := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_today0 := (DATE(v_vn_now) + TIME '00:00:00') AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_month0 := (DATE_TRUNC('month', v_vn_now)::date + TIME '00:00:00') AT TIME ZONE 'Asia/Ho_Chi_Minh';

  RETURN QUERY
  SELECT
    w.full_name,
    w.email,
    COUNT(l.id) FILTER (WHERE l.created_at >= v_today0 AND l.action <> 'reject')::int,
    COUNT(l.id) FILTER (WHERE l.created_at >= v_today0 AND l.action = 'reject')::int,
    COUNT(l.id) FILTER (WHERE l.created_at >= v_month0 AND l.action <> 'reject')::int,
    COUNT(l.id) FILTER (WHERE l.created_at >= v_month0 AND l.action = 'reject')::int
  FROM public.submission_whitelist w
  LEFT JOIN public.profiles p ON lower(p.email) = w.email
  LEFT JOIN public.review_log l ON l.reviewer_id = p.id AND l.created_at >= v_month0
  GROUP BY w.full_name, w.email
  ORDER BY 5 DESC, w.full_name;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_crawled_news(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_crawled_news(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_review_dashboard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.count_words(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_crawled_news(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_crawled_news(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_review_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_words(text) TO authenticated;
