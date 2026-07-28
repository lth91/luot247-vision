-- HYBRID ĐỢT 1 (28/07): giám khảo P1 chạy LOCAL sau công tắc — build sẵn,
-- mặc định TẮT. Bật bằng: UPDATE hybrid_config SET enabled = true WHERE key = 'crawl_giam_khao';
--
-- Luồng khi BẬT: crawl-news viết xong bản tin (P3 vẫn Haiku) → thay vì gọi
-- Haiku giám khảo, xếp job 'giam_khao_live' vào llm_shadow_queue (kèm extra =
-- nguyên liệu insert news) → worker Mac chấm → edge crawl-finalize (cron 5')
-- áp phán quyết: dat/dbm/ckt → insert news; loai/trung → crawl_reject_log.
-- Job quá 12' không ai chấm → finalize gọi Haiku chấm thay (fallback), Haiku
-- cũng lỗi → vào hàng đợi kèm nhãn cần kiểm tra (fail-open, không mất tin).

-- 1) Nới bảng hàng đợi bóng cho việc "thật"
ALTER TABLE public.llm_shadow_queue DROP CONSTRAINT IF EXISTS llm_shadow_queue_task_check;
ALTER TABLE public.llm_shadow_queue ADD CONSTRAINT llm_shadow_queue_task_check
  CHECK (task IN ('phan_loai', 'kiem_som', 'giam_khao', 'giam_khao_live'));
ALTER TABLE public.llm_shadow_queue DROP CONSTRAINT IF EXISTS llm_shadow_queue_status_check;
ALTER TABLE public.llm_shadow_queue ADD CONSTRAINT llm_shadow_queue_status_check
  CHECK (status IN ('pending', 'processing', 'done', 'error', 'finalized'));
ALTER TABLE public.llm_shadow_queue ADD COLUMN IF NOT EXISTS url_hash text;
ALTER TABLE public.llm_shadow_queue ADD COLUMN IF NOT EXISTS extra jsonb;
CREATE INDEX IF NOT EXISTS idx_shadow_live_urlhash
  ON public.llm_shadow_queue (url_hash) WHERE task = 'giam_khao_live';
CREATE INDEX IF NOT EXISTS idx_shadow_live_done
  ON public.llm_shadow_queue (status, created_at) WHERE task = 'giam_khao_live';

-- 2) Công tắc hybrid
CREATE TABLE IF NOT EXISTS public.hybrid_config (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hybrid_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hybrid_config FROM anon, authenticated;
INSERT INTO public.hybrid_config (key, enabled) VALUES ('crawl_giam_khao', false)
ON CONFLICT (key) DO NOTHING;

-- 3) Worker nhận việc THẬT trước, việc bóng sau
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
      ORDER BY CASE WHEN task = 'giam_khao_live' THEN 0 ELSE 1 END, created_at DESC
      LIMIT _limit
      FOR UPDATE SKIP LOCKED)
  RETURNING q.*;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_shadow_jobs(int, text) FROM PUBLIC, anon, authenticated;

-- 4) Cron gọi crawl-finalize mỗi 5 phút (lệch mốc crawl 5,20,35,50)
CREATE OR REPLACE FUNCTION public.call_crawl_finalize()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
BEGIN
  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  PERFORM net.http_post(
    url := 'https://gklpvaindbfkcmuuuffz.supabase.co/functions/v1/crawl-finalize',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(v_key, ''),
      'apikey', COALESCE(v_key, '')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
END;
$$;

SELECT cron.schedule('crawl-finalize-tick', '3-58/5 * * * *', 'SELECT public.call_crawl_finalize()');
