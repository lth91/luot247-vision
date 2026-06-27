-- PR A — Hệ thống điểm + log submission cho tin do user gửi.

-- 1) Cột điểm/thống kê trên profiles -----------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS total_points int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS submitted_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approved_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rejected_count int NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.profiles.total_points IS 'Điểm đóng góp tích luỹ (gamification). +10/tin được đăng, -5 nếu admin gỡ, -1/submission bị auto-reject. Floor 0.';
COMMENT ON COLUMN public.profiles.submitted_count IS 'Tổng số lần gửi tin (gồm cả accepted + auto-rejected).';
COMMENT ON COLUMN public.profiles.approved_count IS 'Số tin được đăng (pass auto-check).';
COMMENT ON COLUMN public.profiles.rejected_count IS 'Số submission bị auto-reject + số tin bị admin gỡ.';

-- 2) Bảng submission_log -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.submission_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  news_id uuid REFERENCES public.news(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN (
    'accepted',
    'rejected_length',
    'rejected_duplicate',
    'rejected_similar',
    'rejected_ai',
    'rejected_implausible',
    'error'
  )),
  reject_reason text,
  ai_score jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.submission_log IS 'Mỗi lần user gửi tin (accepted/rejected/error) để hiển thị lịch sử + chấm điểm + tune threshold.';

CREATE INDEX IF NOT EXISTS idx_submission_log_user_created
  ON public.submission_log (user_id, created_at DESC);

-- 3) RLS submission_log ------------------------------------------------------
-- INSERT chỉ qua edge function (service_role, bỏ qua RLS) → KHÔNG tạo INSERT
-- policy cho anon/authenticated (mặc định deny).
ALTER TABLE public.submission_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own submission log" ON public.submission_log;
CREATE POLICY "Users can view own submission log" ON public.submission_log
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all submission log" ON public.submission_log;
CREATE POLICY "Admins can view all submission log" ON public.submission_log
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
