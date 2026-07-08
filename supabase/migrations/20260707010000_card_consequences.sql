-- HỆ QUẢ CỦA THẺ (chốt 07/07) — 3 thay đổi lớn so với bản 20260705010000:
--   1. BỎ BIỂU QUYẾT: báo thẻ là thẻ TỰ XÁC NHẬN NGAY (không vote ±3, không chờ
--      duyệt). Manager/admin hậu kiểm qua "Thẻ đã chốt" + Hủy thẻ.
--   2. THẺ ĐỎ → tin bị GỠ NGAY (reason 'system' → chỉ thu hồi 10đ thưởng,
--      không phạt thêm, không strike). Hủy thẻ đỏ oan → tin tự đăng lại + hoàn 10đ.
--   3. THẺ VÀNG → tác giả sửa tin (edge submit-news chế độ edit); sửa đạt chuẩn
--      → thẻ chuyển 'resolved' (hết đếm kỷ luật 2 vàng = 1 đỏ).
-- Chốt an toàn: mỗi tin tối đa 1 thẻ đang hiệu lực (approved).

-- ===== 1) Status mới 'resolved' =====
ALTER TABLE public.news_cards DROP CONSTRAINT IF EXISTS news_cards_status_check;
ALTER TABLE public.news_cards ADD CONSTRAINT news_cards_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'amnestied', 'resolved'));

-- ===== 2) Bỏ hệ biểu quyết =====
DROP FUNCTION IF EXISTS public.vote_news_card(uuid, boolean);
DROP FUNCTION IF EXISTS public.get_voting_cards();
DROP TABLE IF EXISTS public.news_card_votes;

-- ===== 3) report_news_card: thẻ hiệu lực NGAY + chặn tin đã có thẻ =====
CREATE OR REPLACE FUNCTION public.report_news_card(_news_id uuid, _card_type text, _reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author uuid;
  v_title text;
BEGIN
  IF NOT public.is_submission_allowed() THEN
    RAISE EXCEPTION 'Chỉ thành viên nhóm gửi tin mới được báo thẻ.';
  END IF;
  IF _card_type NOT IN ('yellow', 'red') THEN
    RAISE EXCEPTION 'Loại thẻ không hợp lệ.';
  END IF;
  IF coalesce(array_length(regexp_split_to_array(trim(coalesce(_reason,'')), '\s+'), 1), 0) < 5 THEN
    RAISE EXCEPTION 'Vui lòng ghi lý do cụ thể (ít nhất 5 từ).';
  END IF;

  SELECT submitted_by, title INTO v_author, v_title FROM public.news WHERE id = _news_id;
  IF v_title IS NULL THEN
    RAISE EXCEPTION 'Tin không tồn tại.';
  END IF;
  IF v_author IS NULL THEN
    RAISE EXCEPTION 'Chỉ báo thẻ được tin do thành viên nhóm gửi.';
  END IF;
  IF v_author = auth.uid() THEN
    RAISE EXCEPTION 'Không thể tự báo thẻ tin của chính mình.';
  END IF;
  -- Mỗi tin tối đa 1 thẻ đang hiệu lực (tránh 1 tin ăn nhiều thẻ từ nhiều người).
  IF EXISTS (SELECT 1 FROM public.news_cards c WHERE c.news_id = _news_id AND c.status = 'approved') THEN
    RAISE EXCEPTION 'Tin này đã có thẻ đang hiệu lực — không cần báo thêm.';
  END IF;

  -- Hiệu lực NGAY: trigger cấm 3 đỏ + trigger gỡ tin (thẻ đỏ) chạy theo INSERT này.
  INSERT INTO public.news_cards (news_id, news_title, author_id, reporter_id, card_type, reason, status, reviewed_at, review_note)
  VALUES (_news_id, v_title, v_author, auth.uid(), _card_type, trim(_reason), 'approved', now(), 'Tự xác nhận khi báo');

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Bạn đã báo thẻ tin này rồi.';
END;
$$;

REVOKE ALL ON FUNCTION public.report_news_card(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_news_card(uuid, text, text) TO authenticated;

-- ===== 4) Trigger: thẻ ĐỎ hiệu lực → gỡ tin ngay =====
CREATE OR REPLACE FUNCTION public.red_card_takedown()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND NEW.card_type = 'red' AND NEW.news_id IS NOT NULL THEN
    -- reason 'system': trigger điểm sẵn có chỉ thu hồi 10đ thưởng, không strike.
    -- takedown_note 'card:<id>' để nhánh HỦY thẻ nhận diện và khôi phục đúng tin.
    UPDATE public.news
    SET is_approved = false,
        takedown_reason = 'system',
        takedown_at = now(),
        takedown_by = NEW.reporter_id,
        takedown_note = 'card:' || NEW.id
    WHERE id = NEW.news_id AND is_approved = true;
  END IF;
  RETURN NULL; -- AFTER trigger
END;
$$;

DROP TRIGGER IF EXISTS trg_red_card_takedown ON public.news_cards;
CREATE TRIGGER trg_red_card_takedown
  AFTER INSERT OR UPDATE OF status ON public.news_cards
  FOR EACH ROW EXECUTE FUNCTION public.red_card_takedown();

-- ===== 5) review_news_card: HỦY thẻ đỏ → khôi phục tin + hoàn 10đ =====
CREATE OR REPLACE FUNCTION public.review_news_card(_card_id uuid, _approve boolean, _final_type text DEFAULT NULL, _note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card public.news_cards%ROWTYPE;
  v_restored boolean := false;
BEGIN
  IF NOT public.is_contribution_manager() THEN
    RAISE EXCEPTION 'Chỉ quản lý đóng góp được xử lý thẻ.';
  END IF;
  IF _final_type IS NOT NULL AND _final_type NOT IN ('yellow', 'red') THEN
    RAISE EXCEPTION 'Loại thẻ không hợp lệ.';
  END IF;

  SELECT * INTO v_card FROM public.news_cards WHERE id = _card_id;
  IF v_card.id IS NULL OR v_card.status = 'amnestied' THEN
    RAISE EXCEPTION 'Thẻ không tồn tại hoặc đã ân xá.';
  END IF;

  UPDATE public.news_cards
  SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
      card_type = coalesce(_final_type, card_type),
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = nullif(trim(coalesce(_note, '')), '')
  WHERE id = _card_id;

  -- HỦY thẻ đỏ đang hiệu lực: nếu tin đang bị gỡ bởi CHÍNH thẻ này → đăng lại
  -- + hoàn 10đ thưởng cho tác giả (trigger điểm cố ý không tự hoàn khi khôi phục).
  IF NOT _approve AND v_card.status = 'approved' AND v_card.card_type = 'red' AND v_card.news_id IS NOT NULL THEN
    UPDATE public.news
    SET is_approved = true,
        takedown_reason = NULL, takedown_at = NULL, takedown_by = NULL, takedown_note = NULL
    WHERE id = v_card.news_id AND is_approved = false AND takedown_note = 'card:' || v_card.id;
    IF FOUND THEN
      UPDATE public.profiles SET total_points = total_points + 10 WHERE id = v_card.author_id;
      v_restored := true;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'restored', v_restored);
END;
$$;

REVOKE ALL ON FUNCTION public.review_news_card(uuid, boolean, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_news_card(uuid, boolean, text, text) TO authenticated;

-- ===== 6) RPC: tác giả xem thẻ vàng cần sửa của mình (ẨN người báo) =====
CREATE OR REPLACE FUNCTION public.get_my_yellow_cards()
RETURNS TABLE(
  card_id uuid,
  news_id uuid,
  news_title text,
  reason text,
  created_at timestamptz,
  current_title text,
  current_description text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_submission_allowed() THEN
    RAISE EXCEPTION 'Chỉ thành viên nhóm gửi tin mới xem được.';
  END IF;

  RETURN QUERY
  SELECT c.id, c.news_id, c.news_title, c.reason, c.created_at,
         n.title, n.description
  FROM public.news_cards c
  JOIN public.news n ON n.id = c.news_id
  WHERE c.author_id = auth.uid()
    AND c.status = 'approved'
    AND c.card_type = 'yellow'
    AND n.is_approved = true
  ORDER BY c.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_yellow_cards() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_yellow_cards() TO authenticated;
