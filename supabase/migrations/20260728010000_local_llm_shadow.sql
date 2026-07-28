-- CHẾ ĐỘ BÓNG LOCAL LLM (bước 1, 28/07 — sau khi qwen3:14b đậu bước 0).
-- Edge functions ghi INPUT + phán quyết Haiku vào llm_shadow_queue; worker
-- trên Mac (scripts/local-worker/worker.py) poll về, chấm bằng model local,
-- ghi ngược kết quả. Local CHƯA có quyền quyết — chỉ so khớp. Sau ~1 tuần
-- xem v_shadow_summary để quyết trao quyền lớp nào.

CREATE TABLE IF NOT EXISTS public.llm_shadow_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  task text NOT NULL CHECK (task IN ('phan_loai', 'kiem_som', 'giam_khao')),
  payload jsonb NOT NULL,        -- input y hệt cái Haiku nhìn thấy
  haiku_verdict jsonb NOT NULL,  -- phán quyết Haiku (đáp án đối chứng)
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'error')),
  claimed_at timestamptz,
  done_at timestamptz,
  worker text,
  model text,
  local_verdict jsonb,
  local_ms int
);
CREATE INDEX IF NOT EXISTS idx_shadow_status_created
  ON public.llm_shadow_queue (status, created_at DESC);
ALTER TABLE public.llm_shadow_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.llm_shadow_queue FROM anon, authenticated;

-- Nhịp tim worker: worker upsert mỗi vòng poll; sau này lớp trao quyền sẽ
-- dựa vào last_seen để quyết local hay Haiku.
CREATE TABLE IF NOT EXISTS public.local_worker_status (
  worker text PRIMARY KEY,
  last_seen timestamptz NOT NULL DEFAULT now(),
  info jsonb
);
ALTER TABLE public.local_worker_status ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.local_worker_status FROM anon, authenticated;

-- Worker nhận việc: MỚI NHẤT trước (so khớp luôn tươi; việc cũ quá 3 ngày
-- không ai chấm sẽ bị cron dọn). Job processing kẹt >15' được nhả lại.
CREATE OR REPLACE FUNCTION public.claim_shadow_jobs(_limit int DEFAULT 3, _worker text DEFAULT 'mac')
RETURNS SETOF public.llm_shadow_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.llm_shadow_queue q
     SET status = 'processing', claimed_at = now(), worker = _worker
   WHERE q.id IN (
     SELECT id FROM public.llm_shadow_queue
      WHERE status = 'pending'
         OR (status = 'processing' AND claimed_at < now() - interval '15 minutes')
      ORDER BY created_at DESC
      LIMIT _limit
      FOR UPDATE SKIP LOCKED)
  RETURNING q.*;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_shadow_jobs(int, text) FROM PUBLIC, anon, authenticated;

-- Bảng điểm hằng ngày: khớp Haiku theo từng lớp việc.
-- phan_loai: khớp chuyên mục. kiem_som/giam_khao: khớp nhị phân trùng/không.
CREATE OR REPLACE VIEW public.v_shadow_summary AS
SELECT (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS ngay,
       task,
       count(*) AS tong,
       count(*) FILTER (WHERE status = 'done') AS da_cham,
       count(*) FILTER (WHERE status = 'done' AND CASE task
         WHEN 'phan_loai' THEN (haiku_verdict->>'cat') = (local_verdict->>'cat')
         ELSE ((haiku_verdict->>'verdict') = 'trung') = ((local_verdict->>'verdict') = 'trung')
       END) AS khop,
       count(*) FILTER (WHERE status = 'done' AND task = 'giam_khao'
         AND (haiku_verdict->>'verdict') = 'loai' AND (local_verdict->>'verdict') <> 'loai') AS haiku_loai_local_cho_qua,
       count(*) FILTER (WHERE status = 'error') AS loi
  FROM public.llm_shadow_queue
 GROUP BY 1, 2
 ORDER BY 1 DESC, 2;
REVOKE ALL ON public.v_shadow_summary FROM anon, authenticated;

-- Dọn rác hằng đêm 2h50 VN: done giữ 14 ngày, pending/processing mồ côi 3
-- ngày, error 7 ngày.
SELECT cron.schedule('shadow-queue-purge', '50 19 * * *',
  $$DELETE FROM public.llm_shadow_queue
     WHERE (status = 'done' AND created_at < now() - interval '14 days')
        OR (status IN ('pending', 'processing') AND created_at < now() - interval '3 days')
        OR (status = 'error' AND created_at < now() - interval '7 days')$$);
