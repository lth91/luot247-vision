-- Hệ thống THẺ VÀNG / THẺ ĐỎ cho tin nhân viên gửi (chốt 04/07):
--   • Nhân viên whitelist báo thẻ tin của NHAU (không tự báo tin mình) qua RPC.
--   • Thẻ chỉ TÍNH sau khi admin duyệt (chống trả đũa/phe phái).
--   • VÀNG = lỗi nhẹ, ĐỎ = lỗi nặng; quy đổi 2 vàng = 1 đỏ khi đếm ngưỡng cấm.
--   • Đủ 3 đỏ hiệu lực (đỏ + floor(vàng/2)) → profiles.submission_banned=true,
--     edge submit-news/bulk chặn gửi; admin "Mở khóa" để ân xá (thẻ → amnestied).
--   • Người phát hiện KHÔNG cộng điểm hệ thống — chỉ ghi nhận (thưởng tiền ngoài).
--   • KHÔNG đụng total_points/strike_count/cơ chế takedown hiện có.

-- ===== 1) Bảng news_cards =====
CREATE TABLE IF NOT EXISTS public.news_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  news_id uuid REFERENCES public.news(id) ON DELETE SET NULL,
  news_title text NOT NULL,              -- snapshot: tin có thể bị gỡ/xoá sau
  author_id uuid NOT NULL,               -- submitted_by của tin lúc báo
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_type text NOT NULL CHECK (card_type IN ('yellow', 'red')),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'amnestied')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (news_id, reporter_id)          -- mỗi người chỉ báo 1 lần / tin
);

CREATE INDEX IF NOT EXISTS idx_news_cards_author_status ON public.news_cards (author_id, status);
CREATE INDEX IF NOT EXISTS idx_news_cards_status_created ON public.news_cards (status, created_at DESC);

ALTER TABLE public.news_cards ENABLE ROW LEVEL SECURITY;

-- Người báo xem được báo cáo của mình; admin xem/sửa tất. INSERT chỉ qua RPC.
DROP POLICY IF EXISTS "Reporters view own cards" ON public.news_cards;
CREATE POLICY "Reporters view own cards" ON public.news_cards
  FOR SELECT USING (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Admins manage all cards" ON public.news_cards;
CREATE POLICY "Admins manage all cards" ON public.news_cards
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ===== 2) Cột cấm gửi tin =====
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS submission_banned boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.profiles.submission_banned IS
  'true = bị cấm gửi tin (đủ 3 thẻ đỏ hiệu lực). Admin mở lại qua lift_submission_ban().';

-- ===== 3) RPC: nhân viên báo thẻ =====
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

  INSERT INTO public.news_cards (news_id, news_title, author_id, reporter_id, card_type, reason)
  VALUES (_news_id, v_title, v_author, auth.uid(), _card_type, trim(_reason));

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Bạn đã báo thẻ tin này rồi — đang chờ admin xử lý.';
END;
$$;

REVOKE ALL ON FUNCTION public.report_news_card(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_news_card(uuid, text, text) TO authenticated;

-- ===== 4) RPC: admin duyệt thẻ =====
CREATE OR REPLACE FUNCTION public.review_news_card(_card_id uuid, _approve boolean, _final_type text DEFAULT NULL, _note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Chỉ admin được duyệt thẻ.';
  END IF;
  IF _final_type IS NOT NULL AND _final_type NOT IN ('yellow', 'red') THEN
    RAISE EXCEPTION 'Loại thẻ không hợp lệ.';
  END IF;

  UPDATE public.news_cards
  SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
      card_type = coalesce(_final_type, card_type),   -- admin quyết mức cuối
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = nullif(trim(coalesce(_note, '')), '')
  WHERE id = _card_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Thẻ không tồn tại hoặc đã được xử lý.';
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.review_news_card(uuid, boolean, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_news_card(uuid, boolean, text, text) TO authenticated;

-- ===== 5) RPC: admin mở khóa (ân xá) =====
CREATE OR REPLACE FUNCTION public.lift_submission_ban(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Chỉ admin được mở khóa.';
  END IF;
  -- Thẻ đã tính chuyển 'amnestied' (giữ lịch sử, hết đếm) rồi mới gỡ cấm —
  -- tránh trigger re-ban ngay ở thẻ kế tiếp.
  UPDATE public.news_cards SET status = 'amnestied'
  WHERE author_id = _user_id AND status = 'approved';
  UPDATE public.profiles SET submission_banned = false WHERE id = _user_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.lift_submission_ban(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lift_submission_ban(uuid) TO authenticated;

-- ===== 6) Trigger: đủ 3 đỏ hiệu lực → cấm =====
CREATE OR REPLACE FUNCTION public.recalc_submission_ban()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_red int;
  v_yellow int;
BEGIN
  IF NEW.status = 'approved' THEN
    SELECT COUNT(*) FILTER (WHERE card_type = 'red'),
           COUNT(*) FILTER (WHERE card_type = 'yellow')
    INTO v_red, v_yellow
    FROM public.news_cards
    WHERE author_id = NEW.author_id AND status = 'approved';

    -- 2 vàng = 1 đỏ. Chỉ set true; mở lại là việc của admin (lift_submission_ban).
    IF v_red + FLOOR(v_yellow / 2.0) >= 3 THEN
      UPDATE public.profiles SET submission_banned = true WHERE id = NEW.author_id;
    END IF;
  END IF;
  RETURN NULL; -- AFTER trigger
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_submission_ban ON public.news_cards;
CREATE TRIGGER trg_recalc_submission_ban
  AFTER INSERT OR UPDATE OF status ON public.news_cards
  FOR EACH ROW EXECUTE FUNCTION public.recalc_submission_ban();

-- ===== 7) Dashboard: thêm cột thẻ + trạng thái cấm =====
DROP FUNCTION IF EXISTS public.get_submission_dashboard();
CREATE OR REPLACE FUNCTION public.get_submission_dashboard()
RETURNS TABLE(
  full_name text,
  email text,
  sub_today int,
  sub_month int,
  acc_today int,
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
  v_month0 timestamptz;
  v_prev0  timestamptz;
BEGIN
  IF NOT public.is_submission_allowed() THEN
    RAISE EXCEPTION 'Chỉ tài khoản được phép gửi tin mới xem được bảng theo dõi.';
  END IF;

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
  ORDER BY 6 DESC, w.full_name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_submission_dashboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_submission_dashboard() TO authenticated;
