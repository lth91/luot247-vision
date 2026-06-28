-- Cơ chế PHẠT phân tầng khi admin gỡ tin user + chặn xoá cứng né phạt.
-- Yêu cầu: admin đọc lại, thấy tin không ổn → gỡ kèm LÝ DO → trừ điểm theo mức.

-- 1) Cột takedown trên news (lưu lý do + bằng chứng) ------------------------
ALTER TABLE public.news
  ADD COLUMN IF NOT EXISTS takedown_reason text,
  ADD COLUMN IF NOT EXISTS takedown_at timestamptz,
  ADD COLUMN IF NOT EXISTS takedown_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS takedown_note text;

-- 2) strike_count trên profiles (đếm vi phạm có lỗi tác giả) ----------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS strike_count int NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.profiles.strike_count IS 'Số lần tin bị gỡ do lỗi tác giả (format/factual/severe). system không tính.';

-- 3) Bảng mức phạt (điểm PHẠT cộng thêm, NGOÀI việc thu hồi +10 thưởng gốc):
--    system  = 0   → chỉ thu hồi thưởng (lỗi hệ thống/biên tập, không phải lỗi tác giả)
--    format  = 5   → lỗi nhẹ (sai mục, văn phong)        → net -15
--    factual = 20  → sai sự thật / bịa số liệu            → net -30
--    severe  = 50  → bịa hoàn toàn / đạo văn / spam       → net -60
CREATE OR REPLACE FUNCTION public.takedown_penalty(_reason text)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _reason
    WHEN 'system'  THEN 0
    WHEN 'format'  THEN 5
    WHEN 'factual' THEN 20
    WHEN 'severe'  THEN 50
    ELSE 5  -- thiếu/không hợp lệ → coi như lỗi nhẹ
  END;
$$;

-- 4) Viết lại trigger điểm: thêm phạt khi gỡ + hoàn khi khôi phục ----------
-- (cho phép total_points ÂM để phạt thực sự "cắn" — không lách bằng cách về 0.
--  Leaderboard đã lọc total_points > 0 nên số âm không hiển thị.)
CREATE OR REPLACE FUNCTION public.award_points_on_news()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pen int;
  v_author_fault boolean;
BEGIN
  IF (TG_OP = 'INSERT') THEN
    IF NEW.submitted_by IS NOT NULL THEN
      UPDATE public.profiles
      SET submitted_count = submitted_count + 1,
          approved_count  = approved_count + (CASE WHEN NEW.is_approved THEN 1 ELSE 0 END),
          total_points    = total_points + (CASE WHEN NEW.is_approved THEN 10 ELSE 0 END)
      WHERE id = NEW.submitted_by;
    END IF;

  ELSIF (TG_OP = 'UPDATE') THEN
    IF NEW.submitted_by IS NULL THEN RETURN NULL; END IF;

    -- GỠ tin: true → false
    IF OLD.is_approved = true AND NEW.is_approved = false THEN
      v_pen := public.takedown_penalty(NEW.takedown_reason);
      v_author_fault := COALESCE(NEW.takedown_reason, '') NOT IN ('system', '');
      UPDATE public.profiles
      SET total_points   = total_points - (10 + v_pen),                       -- thu hồi thưởng + phạt
          approved_count = GREATEST(0, approved_count - 1),
          rejected_count = rejected_count + (CASE WHEN v_author_fault THEN 1 ELSE 0 END),
          strike_count   = strike_count + (CASE WHEN v_author_fault THEN 1 ELSE 0 END)
      WHERE id = NEW.submitted_by;

    -- KHÔI PHỤC tin: false → true (admin gỡ nhầm rồi duyệt lại) → hoàn nguyên
    ELSIF OLD.is_approved = false AND NEW.is_approved = true THEN
      v_pen := public.takedown_penalty(OLD.takedown_reason);
      v_author_fault := COALESCE(OLD.takedown_reason, '') NOT IN ('system', '');
      UPDATE public.profiles
      SET total_points   = total_points + (10 + v_pen),
          approved_count = approved_count + 1,
          rejected_count = GREATEST(0, rejected_count - (CASE WHEN v_author_fault THEN 1 ELSE 0 END)),
          strike_count   = GREATEST(0, strike_count - (CASE WHEN v_author_fault THEN 1 ELSE 0 END))
      WHERE id = NEW.submitted_by;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

-- 5) Bỏ floor 0 ở phạt auto-reject (cho phép âm, nhất quán "phạt cắn") ------
CREATE OR REPLACE FUNCTION public.penalize_rejected_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status LIKE 'rejected_%' THEN
    UPDATE public.profiles
    SET submitted_count = submitted_count + 1,
        rejected_count  = rejected_count + 1,
        total_points    = total_points - 1
    WHERE id = NEW.user_id;
  END IF;
  RETURN NULL;
END;
$$;

-- 6) CHẶN XOÁ CỨNG tin do user gửi (ép gỡ mềm để áp phạt + giữ bằng chứng) --
CREATE OR REPLACE FUNCTION public.block_hard_delete_user_news()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Không xoá cứng tin do user gửi. Hãy GỠ MỀM: UPDATE news SET is_approved=false, takedown_reason=... để áp điểm phạt và giữ bằng chứng. (Nếu thực sự cần xoá cứng: tạm ALTER TABLE news DISABLE TRIGGER trg_block_hard_delete_user_news.)';
END;
$$;

DROP TRIGGER IF EXISTS trg_block_hard_delete_user_news ON public.news;
CREATE TRIGGER trg_block_hard_delete_user_news
  BEFORE DELETE ON public.news
  FOR EACH ROW
  WHEN (OLD.submitted_by IS NOT NULL)
  EXECUTE FUNCTION public.block_hard_delete_user_news();
