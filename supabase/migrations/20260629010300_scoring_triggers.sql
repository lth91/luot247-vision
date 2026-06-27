-- PR A — Trigger tự động cập nhật điểm/thống kê vào profiles.
-- SECURITY DEFINER + search_path public (pattern has_role / handle_new_user).

-- 1) Khi tin user gửi được INSERT (đã pass auto-check, is_approved=true) hoặc
--    bị admin gỡ (UPDATE is_approved true→false) ------------------------------
CREATE OR REPLACE FUNCTION public.award_points_on_news()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    -- Chỉ tính cho tin do user gửi (submitted_by IS NOT NULL).
    IF NEW.submitted_by IS NOT NULL THEN
      UPDATE public.profiles
      SET submitted_count = submitted_count + 1,
          approved_count  = approved_count + (CASE WHEN NEW.is_approved THEN 1 ELSE 0 END),
          total_points    = total_points + (CASE WHEN NEW.is_approved THEN 10 ELSE 0 END)
      WHERE id = NEW.submitted_by;
    END IF;

  ELSIF (TG_OP = 'UPDATE') THEN
    -- Admin gỡ tin đã đăng của user: is_approved true → false → phạt -5.
    IF NEW.submitted_by IS NOT NULL
       AND OLD.is_approved = true AND NEW.is_approved = false THEN
      UPDATE public.profiles
      SET rejected_count = rejected_count + 1,
          total_points   = GREATEST(0, total_points - 5)
      WHERE id = NEW.submitted_by;
    END IF;
    -- (Cố ý KHÔNG tự cộng lại điểm khi admin re-approve false→true để tránh
    --  gaming; re-approve là thao tác tay hiếm gặp.)
  END IF;

  RETURN NULL; -- AFTER trigger
END;
$$;

DROP TRIGGER IF EXISTS trg_award_points_on_news ON public.news;
CREATE TRIGGER trg_award_points_on_news
  AFTER INSERT OR UPDATE OF is_approved ON public.news
  FOR EACH ROW EXECUTE FUNCTION public.award_points_on_news();

-- 2) Khi 1 submission bị AUTO-REJECT (ghi vào submission_log) → phạt nhẹ -1,
--    đếm như 1 lần gửi (submitted_count) để tính tỉ lệ pass. -----------------
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
        total_points    = GREATEST(0, total_points - 1)
    WHERE id = NEW.user_id;
  END IF;
  RETURN NULL; -- AFTER trigger
END;
$$;

DROP TRIGGER IF EXISTS trg_penalize_rejected_submission ON public.submission_log;
CREATE TRIGGER trg_penalize_rejected_submission
  AFTER INSERT ON public.submission_log
  FOR EACH ROW EXECUTE FUNCTION public.penalize_rejected_submission();
