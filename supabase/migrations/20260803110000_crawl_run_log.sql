-- BIÊN BẢN CRAWL TỰ GHI (03/08). Bối cảnh: từ khi lượt crawl kéo dài hơn 150s,
-- gateway cắt HTTP response (504 IDLE_TIMEOUT) — function vẫn chạy tiếp bình
-- thường nhưng không ai đọc được biên bản nữa. Giờ crawl-news tự INSERT stats
-- vào bảng này cuối mỗi lượt.
--
-- Soi nhanh:
--   SELECT created_at, run_ms/1000 AS giay,
--          stats->>'sources' AS nguon, stats->>'inserted' AS dang,
--          stats->>'llmCalls' AS cu_llm, stats->>'deferredJudge' AS cho_local,
--          jsonb_array_length(stats->'errors') AS loi
--     FROM crawl_run_log ORDER BY created_at DESC LIMIT 10;
-- Soi lỗi theo nguồn (vd PLO/TTVH 0 tin):
--   SELECT created_at, e.value AS loi
--     FROM crawl_run_log, jsonb_array_elements_text(stats->'errors') e
--    WHERE e.value ILIKE '%PLO%' ORDER BY created_at DESC LIMIT 20;

CREATE TABLE IF NOT EXISTS public.crawl_run_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  run_ms integer,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_crawl_run_log_created ON public.crawl_run_log (created_at DESC);
ALTER TABLE public.crawl_run_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crawl_run_log FROM anon, authenticated;

-- Dọn biên bản cũ hơn 14 ngày (mỗi ngày ~96 lượt, giữ gọn).
SELECT cron.schedule('crawl-run-log-purge', '5 20 * * *',
  $$DELETE FROM public.crawl_run_log WHERE created_at < now() - interval '14 days'$$);
