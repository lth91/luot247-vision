-- "Kiểm 2 lượt" theo sơ đồ sếp 17/07 (A/B/C trên bảng trắng, sếp đã gật):
--   Lượt 1: ngay sau khi AI viết — giám khảo P1 đối chiếu bản tin với bài gốc
--            + phán trùng với TIN ĐÃ ĐĂNG (edge function crawl-news gọi AI).
--   Lượt 2: đúng lúc nhân viên bấm Duyệt — bắt trùng với tin VỪA ĐĂNG trong
--            lúc bản tin nằm chờ (RPC approve, trigram, không tốn AI).
-- Kèm: bảng hồ sơ tin bị P1 loại (sếp yêu cầu lưu lý do cho quản lý tra).

-- ============ 1) RPC tìm tin giống nhất trong TIN ĐÃ XUẤT BẢN ============
-- Luật P1 của sếp: "Chỉ đối chiếu với tin đã xuất bản. Không coi tin trong
-- hàng đợi là tin đã đăng." (2 bản trùng được phép cùng chờ — lượt 2 chặn.)
CREATE OR REPLACE FUNCTION public.find_similar_published_scored(
  _title text,
  _threshold real DEFAULT 0.45
)
RETURNS TABLE (id uuid, title text, sim real, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_norm text;
BEGIN
  v_norm := public.normalize_title_for_similarity(_title);
  IF v_norm IS NULL OR length(v_norm) < 20 THEN
    RETURN;
  END IF;

  PERFORM set_limit(_threshold);

  RETURN QUERY
  SELECT n.id, n.title,
         extensions.similarity(n.title_normalized, v_norm) AS sim,
         n.created_at
  FROM public.news n
  WHERE n.title_normalized IS NOT NULL
    AND n.is_approved = true
    AND n.created_at > now() - interval '7 days'
    AND n.title_normalized % v_norm
    AND extensions.similarity(n.title_normalized, v_norm) >= _threshold
  ORDER BY sim DESC
  LIMIT 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.find_similar_published_scored(text, real) FROM anon, authenticated, public;

-- ============ 2) Hồ sơ tin bị loại (P1 hoặc bước viết loại) ============
CREATE TABLE IF NOT EXISTS public.crawl_reject_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  stage text NOT NULL,              -- 'viet' (P3 loại bài gốc) | 'kiem' (P1 loại bản tin)
  verdict text,                     -- 'loai' | 'trung' | null
  source_name text,
  url text,
  original_title text,
  rewritten_title text,
  reason text,
  similar_news_id uuid,
  similar_title text,
  similar_sim real
);
CREATE INDEX IF NOT EXISTS idx_crawl_reject_log_created ON public.crawl_reject_log (created_at DESC);

ALTER TABLE public.crawl_reject_log ENABLE ROW LEVEL SECURITY;
-- Nhân viên whitelist đọc được (tra lý do); chỉ service role ghi.
DROP POLICY IF EXISTS crawl_reject_log_read ON public.crawl_reject_log;
CREATE POLICY crawl_reject_log_read ON public.crawl_reject_log
  FOR SELECT TO authenticated USING (public.is_submission_allowed());

-- ============ 3) Lượt lọc 2 trong RPC duyệt ============
-- Ngay trước khi đăng: so bản tin với tin ĐÃ ĐĂNG 7 ngày (trigram, miễn phí).
-- Giống >= 0.70 → TỰ ĐỘNG LOẠI khỏi hàng đợi + ghi review_log + trả ok=false
-- (không RAISE để giữ được bản ghi loại — exception sẽ rollback).
CREATE OR REPLACE FUNCTION public.approve_crawled_news(
  _news_id uuid,
  _title text DEFAULT NULL,
  _content text DEFAULT NULL,
  _category text DEFAULT NULL
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

  -- ===== LỌC LƯỢT 2: bắt trùng với tin đã đăng trong lúc bản tin nằm chờ =====
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
      UPDATE public.news SET
        review_status = 'rejected',
        reviewed_by = auth.uid(),
        reviewed_at = now()
      WHERE id = _news_id AND review_status = 'pending' AND submitted_by IS NULL;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Tin không còn trong hàng đợi (đã được người khác xử lý?).';
      END IF;

      INSERT INTO public.review_log (reviewer_id, news_id, news_title, action, reason)
      VALUES (auth.uid(), _news_id, v_final_title, 'reject',
              'Lọc lượt 2 lúc duyệt: trùng ' || round(v_dup_sim * 100) || '% với tin đã đăng «' || left(v_dup_title, 120) || '»');

      INSERT INTO public.crawl_reject_log (stage, verdict, rewritten_title, reason, similar_news_id, similar_title, similar_sim)
      VALUES ('duyet', 'trung', v_final_title,
              'Trùng với tin đã đăng trong lúc chờ duyệt', v_dup_id, v_dup_title, v_dup_sim);

      RETURN jsonb_build_object(
        'ok', false,
        'reason', 'trung_da_dang',
        'similar_title', v_dup_title,
        'similar_sim', round(v_dup_sim::numeric, 2)
      );
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
  INSERT INTO public.review_log (reviewer_id, news_id, news_title, action)
  VALUES (auth.uid(), _news_id, v_final_title, CASE WHEN v_edited THEN 'approve_edited' ELSE 'approve' END);

  RETURN jsonb_build_object('ok', true, 'edited', v_edited);
END;
$$;
