-- HYBRID ĐỢT 2 (31/07): bulk chấm bằng local sau công tắc 3 nấc (anh Long
-- chốt phương án B, giữ đường lùi/tiến):
--   bulk_local = false                → C: Haiku chấm ngay mọi giờ (như cũ)
--   bulk_local = true                 → B: 7h-11h VN Haiku chấm ngay (giữ UX
--     giờ cao điểm); ngoài khung → worker Mac chấm nền, crawl-finalize áp
--     kết quả (tin đạt tự đăng dần ~5-30 phút)
--   + bulk_local_full = true          → A: local chấm nền MỌI GIỜ
-- Lô quá 12' không ai chấm → Haiku chấm thay; Haiku cũng lỗi → lô quay về
-- pending thử lại lượt sau (KHÔNG mất tin của nhân viên).

ALTER TABLE public.llm_shadow_queue DROP CONSTRAINT IF EXISTS llm_shadow_queue_task_check;
ALTER TABLE public.llm_shadow_queue ADD CONSTRAINT llm_shadow_queue_task_check
  CHECK (task IN ('phan_loai', 'kiem_som', 'giam_khao', 'giam_khao_live', 'phan_loai_lo'));

INSERT INTO public.hybrid_config (key, enabled)
VALUES ('bulk_local', false), ('bulk_local_full', false)
ON CONFLICT (key) DO NOTHING;

-- Ưu tiên nhận việc: giám khảo thật (tin chờ lên trang) > lô bulk (nhân viên
-- chờ kết quả) > việc bóng.
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
      ORDER BY CASE task WHEN 'giam_khao_live' THEN 0 WHEN 'phan_loai_lo' THEN 1 ELSE 2 END,
               created_at DESC
      LIMIT _limit
      FOR UPDATE SKIP LOCKED)
  RETURNING q.*;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_shadow_jobs(int, text) FROM PUBLIC, anon, authenticated;
