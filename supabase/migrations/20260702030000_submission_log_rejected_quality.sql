-- Thêm status 'rejected_quality' cho submission_log: tin bị loại theo 4 chiều
-- tiêu chí biên tập mới (quảng cáo/câu view, thiếu dữ kiện cốt lõi, giọng giật
-- gân, rủi ro pháp lý) — theo "Bộ tiêu chí lọc tin". reject_reason chứa chiều
-- vi phạm + hướng dẫn sửa. Giữ 'rejected_offtopic' cho các dòng log cũ.

ALTER TABLE public.submission_log DROP CONSTRAINT IF EXISTS submission_log_status_check;
ALTER TABLE public.submission_log ADD CONSTRAINT submission_log_status_check
  CHECK (status IN (
    'accepted','rejected_length','rejected_duplicate','rejected_similar',
    'rejected_ai','rejected_implausible','rejected_offtopic','rejected_quality','error'
  ));
