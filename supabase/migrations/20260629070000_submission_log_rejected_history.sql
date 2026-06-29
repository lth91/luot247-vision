-- Tab "Tin bị loại": cho nhân viên xem lại tin bị loại (tiêu đề + lý do) bất kỳ
-- lúc nào, không phải import lại để xem.
--
-- 1) submission_log trước đây KHÔNG lưu tiêu đề → thêm cột `title`.
-- 2) `dismissed`: nhân viên ẩn dòng đã xử lý (sửa xong) khỏi tab.
-- 3) `penalized`: import HÀNG LOẠT ghi log tin loại để HIỂN THỊ nhưng KHÔNG trừ
--    điểm (bulk không phạt). Gửi lẻ vẫn phạt -1 như cũ (default true).

ALTER TABLE public.submission_log
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS dismissed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS penalized boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.submission_log.title IS 'Tiêu đề tin (hiển thị lịch sử tin bị loại). NULL với log cũ.';
COMMENT ON COLUMN public.submission_log.dismissed IS 'Nhân viên đã ẩn dòng này khỏi tab "Tin bị loại".';
COMMENT ON COLUMN public.submission_log.penalized IS 'false = KHÔNG trừ điểm (vd: tin loại từ import hàng loạt — bulk không phạt).';

-- Trigger phạt: chỉ trừ điểm khi penalized = true. Giữ nguyên hành vi gửi lẻ;
-- import hàng loạt ghi penalized=false nên insert log không làm trừ điểm.
CREATE OR REPLACE FUNCTION public.penalize_rejected_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status LIKE 'rejected_%' AND NEW.penalized THEN
    UPDATE public.profiles
    SET submitted_count = submitted_count + 1,
        rejected_count  = rejected_count + 1,
        total_points    = GREATEST(0, total_points - 1)
    WHERE id = NEW.user_id;
  END IF;
  RETURN NULL; -- AFTER trigger
END;
$$;

-- RPC: nhân viên ẩn TẤT CẢ dòng "bị loại" cùng tiêu đề của CHÍNH mình (import lại
-- nhiều lần có thể tạo nhiều dòng cùng tiêu đề). SECURITY DEFINER + lọc auth.uid()
-- nên không cần cấp UPDATE rộng trên bảng.
CREATE OR REPLACE FUNCTION public.dismiss_submission_log(_title text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.submission_log
  SET dismissed = true
  WHERE user_id = auth.uid()
    AND status <> 'accepted'
    AND title IS NOT DISTINCT FROM _title;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dismiss_submission_log(text) TO authenticated;
