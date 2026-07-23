-- Lượt kiểm 2 (lúc bấm Duyệt) KHÔNG tự loại theo % nữa — trả "cần xác nhận"
-- để NGƯỜI quyết (ca oan 23/07 chị Thuỷ báo: «gặp cộng đồng người Việt tại
-- Nhật Bản» bị tự loại vì tiêu đề giống 8x% bài «...tại Hàn Quốc» — 2 sự kiện
-- khác nhau; tin ASEAN cùng dạng. Đúng luật sếp: % giống chỉ để tham khảo).
--
-- Đổi: phát hiện giống >=70% với tin đã đăng 7 ngày → RPC trả needs_confirm
-- (tin VẪN nằm hàng đợi); frontend mở dialog đối chiếu 2 cột, nhân viên bấm
-- «Khác — Vẫn đăng» thì gọi lại với _force_not_dup=true, bấm «Trùng — Loại»
-- thì đi đường reject thường. Không còn insert crawl_reject_log stage='duyet'
-- (từ nay stage đó chỉ còn trong dữ liệu lịch sử).

DROP FUNCTION IF EXISTS public.approve_crawled_news(uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.approve_crawled_news(
  _news_id uuid,
  _title text DEFAULT NULL,
  _content text DEFAULT NULL,
  _category text DEFAULT NULL,
  _force_not_dup boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_edited boolean;
  v_final_title text;
  v_final_content text;
  v_tw int;
  v_total int;
  v_cat public.news_category;
  v_norm text;
  v_dup_id uuid;
  v_dup_title text;
  v_dup_sim real;
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

  -- ===== LỌC LƯỢT 2: chỉ CẢNH BÁO + hỏi người duyệt, không tự loại =====
  IF NOT _force_not_dup THEN
    v_norm := public.normalize_title_for_similarity(v_final_title);
    IF v_norm IS NOT NULL AND length(v_norm) >= 20 THEN
      PERFORM set_limit(0.7);
      SELECT n.id, n.title, extensions.similarity(n.title_normalized, v_norm)
        INTO v_dup_id, v_dup_title, v_dup_sim
      FROM public.news n
      WHERE n.title_normalized IS NOT NULL
        AND n.is_approved = true
        AND n.id <> _news_id
        AND n.created_at > now() - interval '7 days'
        AND n.title_normalized % v_norm
        AND extensions.similarity(n.title_normalized, v_norm) >= 0.7
      ORDER BY 3 DESC
      LIMIT 1;

      IF v_dup_id IS NOT NULL THEN
        RETURN jsonb_build_object(
          'ok', false,
          'needs_confirm', true,
          'reason', 'trung_can_xac_nhan',
          'similar_news_id', v_dup_id,
          'similar_title', v_dup_title,
          'similar_sim', round(v_dup_sim::numeric, 2)
        );
      END IF;
    END IF;
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
  INSERT INTO public.review_log (reviewer_id, news_id, news_title, action, reason)
  VALUES (auth.uid(), _news_id, v_final_title,
          CASE WHEN v_edited THEN 'approve_edited' ELSE 'approve' END,
          CASE WHEN _force_not_dup
               THEN 'Người duyệt xác nhận KHÔNG trùng (cảnh báo lượt 2)'
               ELSE NULL END);

  RETURN jsonb_build_object('ok', true, 'edited', v_edited);
END;
$$;

REVOKE ALL ON FUNCTION public.approve_crawled_news(uuid, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_crawled_news(uuid, text, text, text, boolean) TO authenticated;
