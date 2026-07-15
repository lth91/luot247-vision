-- Chuẩn tin TỰ ĐỘNG đổi thành tổng 100-120 từ (sếp 16/07) + gộp công duyệt
-- vào bảng theo dõi chính (cần thêm cột "duyệt hôm qua" cho khớp).
-- Tin nhân viên gõ tay giữ nguyên chuẩn 120-140 (submit-news không đổi).

-- ===== 1) RPC duyệt: validate theo chuẩn mới 100-120 =====
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

  v_tw := public.count_words(v_final_title);
  v_total := v_tw + public.count_words(v_final_content);
  IF v_tw < 12 OR v_tw > 18 THEN
    RAISE EXCEPTION 'Tiêu đề % từ — chuẩn 12-18 từ. Hãy bấm Sửa trước khi duyệt.', v_tw;
  END IF;
  IF v_total < 100 OR v_total > 120 THEN
    RAISE EXCEPTION 'Tổng % từ — chuẩn tin tự động 100-120 từ. Hãy bấm Sửa trước khi duyệt.', v_total;
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

-- ===== 2) get_review_dashboard: thêm duyệt hôm qua (để gộp vào bảng chính) =====
DROP FUNCTION IF EXISTS public.get_review_dashboard();

CREATE FUNCTION public.get_review_dashboard()
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
    w.email,
    COUNT(l.id) FILTER (WHERE l.created_at >= v_today0 AND l.action <> 'reject')::int,
    COUNT(l.id) FILTER (WHERE l.created_at >= v_today0 AND l.action = 'reject')::int,
    COUNT(l.id) FILTER (WHERE l.created_at >= v_yest0 AND l.created_at < v_today0 AND l.action <> 'reject')::int,
    COUNT(l.id) FILTER (WHERE l.created_at >= v_month0 AND l.action <> 'reject')::int,
    COUNT(l.id) FILTER (WHERE l.created_at >= v_month0 AND l.action = 'reject')::int
  FROM public.submission_whitelist w
  LEFT JOIN public.profiles p ON lower(p.email) = w.email
  LEFT JOIN public.review_log l ON l.reviewer_id = p.id AND l.created_at >= v_month0
  GROUP BY w.full_name, w.email
  ORDER BY 6 DESC, w.full_name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_review_dashboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_review_dashboard() TO authenticated;
