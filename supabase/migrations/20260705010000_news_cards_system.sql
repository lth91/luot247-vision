-- Hệ thống THẺ VÀNG / THẺ ĐỎ cho tin nhân viên gửi (chốt 04-05/07):
--   • Nhân viên whitelist báo thẻ tin của NHAU (không tự báo tin mình) qua RPC.
--   • Thẻ được CỘNG ĐỒNG BIỂU QUYẾT (không có ai chuyên duyệt): mọi thành viên
--     whitelist vote 👍 chuẩn / 👎 oan (trừ tác giả + người báo); chênh lệch
--     đạt +3 → thẻ TÍNH (approved), −3 → HỦY (rejected). Ẩn danh người báo
--     với người vote (chống trả đũa); admin thấy đầy đủ để khen thưởng.
--   • Admin giữ quyền PHỦ QUYẾT: duyệt/hủy thẳng bất kỳ thẻ nào qua
--     review_news_card, bất kể vote.
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

-- ===== 3b) Bảng vote + RPC biểu quyết =====
CREATE TABLE IF NOT EXISTS public.news_card_votes (
  card_id uuid NOT NULL REFERENCES public.news_cards(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vote smallint NOT NULL CHECK (vote IN (-1, 1)),   -- 1 = thẻ chuẩn, -1 = thẻ oan
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (card_id, voter_id)
);

ALTER TABLE public.news_card_votes ENABLE ROW LEVEL SECURITY;

-- Vote đi qua RPC; admin đọc trực tiếp để hiển thị tally trong trang quản trị.
DROP POLICY IF EXISTS "Admins view votes" ON public.news_card_votes;
CREATE POLICY "Admins view votes" ON public.news_card_votes
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- Vote 1 thẻ đang chờ; tự chốt khi chênh lệch đạt ±3. Được đổi vote khi còn pending.
CREATE OR REPLACE FUNCTION public.vote_news_card(_card_id uuid, _agree boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card public.news_cards%ROWTYPE;
  v_net int;
BEGIN
  IF NOT public.is_submission_allowed() THEN
    RAISE EXCEPTION 'Chỉ thành viên nhóm gửi tin mới được biểu quyết.';
  END IF;

  SELECT * INTO v_card FROM public.news_cards WHERE id = _card_id;
  IF v_card.id IS NULL THEN
    RAISE EXCEPTION 'Thẻ không tồn tại.';
  END IF;
  IF v_card.status <> 'pending' THEN
    RAISE EXCEPTION 'Thẻ này đã được chốt.';
  END IF;
  IF v_card.author_id = auth.uid() THEN
    RAISE EXCEPTION 'Bạn là tác giả tin — không tham gia biểu quyết thẻ của chính mình.';
  END IF;
  IF v_card.reporter_id = auth.uid() THEN
    RAISE EXCEPTION 'Bạn là người báo thẻ — không cần vote thêm.';
  END IF;

  INSERT INTO public.news_card_votes (card_id, voter_id, vote)
  VALUES (_card_id, auth.uid(), CASE WHEN _agree THEN 1 ELSE -1 END)
  ON CONFLICT (card_id, voter_id) DO UPDATE SET vote = EXCLUDED.vote, created_at = now();

  SELECT COALESCE(SUM(vote), 0) INTO v_net FROM public.news_card_votes WHERE card_id = _card_id;

  -- Tự chốt theo ngưỡng ±3 (trigger recalc ban chạy theo status update).
  IF v_net >= 3 THEN
    UPDATE public.news_cards
    SET status = 'approved', reviewed_at = now(), review_note = 'Tự chốt theo biểu quyết (chênh +' || v_net || ')'
    WHERE id = _card_id AND status = 'pending';
  ELSIF v_net <= -3 THEN
    UPDATE public.news_cards
    SET status = 'rejected', reviewed_at = now(), review_note = 'Tự hủy theo biểu quyết (chênh ' || v_net || ')'
    WHERE id = _card_id AND status = 'pending';
  END IF;

  RETURN jsonb_build_object('ok', true, 'net', v_net);
END;
$$;

REVOKE ALL ON FUNCTION public.vote_news_card(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vote_news_card(uuid, boolean) TO authenticated;

-- Danh sách thẻ đang biểu quyết cho thành viên (ẨN người báo; kèm tally + vote của tôi).
CREATE OR REPLACE FUNCTION public.get_voting_cards()
RETURNS TABLE(
  id uuid,
  news_title text,
  card_type text,
  reason text,
  created_at timestamptz,
  author_name text,
  up_votes int,
  down_votes int,
  my_vote int,
  can_vote boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_submission_allowed() THEN
    RAISE EXCEPTION 'Chỉ thành viên nhóm gửi tin mới xem được.';
  END IF;

  RETURN QUERY
  SELECT
    nc.id,
    nc.news_title,
    nc.card_type,
    nc.reason,
    nc.created_at,
    COALESCE(p.display_name, split_part(p.email, '@', 1), '—'),
    COALESCE(COUNT(v.vote) FILTER (WHERE v.vote = 1), 0)::int,
    COALESCE(COUNT(v.vote) FILTER (WHERE v.vote = -1), 0)::int,
    COALESCE(MAX(v.vote) FILTER (WHERE v.voter_id = auth.uid()), 0)::int,
    (nc.author_id <> auth.uid() AND nc.reporter_id <> auth.uid())
  FROM public.news_cards nc
  LEFT JOIN public.profiles p ON p.id = nc.author_id
  LEFT JOIN public.news_card_votes v ON v.card_id = nc.id
  WHERE nc.status = 'pending'
  GROUP BY nc.id, nc.news_title, nc.card_type, nc.reason, nc.created_at,
           nc.author_id, nc.reporter_id, p.display_name, p.email
  ORDER BY nc.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_voting_cards() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_voting_cards() TO authenticated;

-- ===== 4) RPC: admin PHỦ QUYẾT (duyệt/hủy thẳng, bất kể vote) =====
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

  -- Phủ quyết được cả thẻ đã chốt bằng vote (trừ thẻ đã ân xá).
  -- Lưu ý: hạ approved → rejected KHÔNG tự gỡ cấm — dùng lift_submission_ban.
  UPDATE public.news_cards
  SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
      card_type = coalesce(_final_type, card_type),   -- admin quyết mức cuối
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = nullif(trim(coalesce(_note, '')), '')
  WHERE id = _card_id AND status IN ('pending', 'approved', 'rejected');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Thẻ không tồn tại hoặc đã ân xá.';
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
