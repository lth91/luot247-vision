-- Log mọi LLM classification trong discovery-rss-news (cả pass lẫn reject).
--
-- Mục đích: thu thập 24-48h data để analyze
--   - Threshold tối ưu (hiện 0.85, có thể 0.70 catch nhiều bài hơn?)
--   - Bài "borderline" (0.50-0.85) có pattern gì
--   - Source nào sinh nhiều bài cần human review
--
-- TTL: 30 ngày, auto-purge bằng cron sau (không trong scope migration này).

CREATE TABLE IF NOT EXISTS public.discovery_classification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classified_at timestamptz NOT NULL DEFAULT now(),
  feed_name text NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  url_hash text,
  relevant boolean,
  confidence numeric NOT NULL,
  reason text,
  inserted boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_dcl_classified_at
  ON public.discovery_classification_log (classified_at DESC);
CREATE INDEX IF NOT EXISTS idx_dcl_borderline
  ON public.discovery_classification_log (confidence DESC)
  WHERE confidence BETWEEN 0.5 AND 0.85;
CREATE INDEX IF NOT EXISTS idx_dcl_url_hash
  ON public.discovery_classification_log (url_hash);

-- RLS: service role only (edge functions). Không expose ra public.
ALTER TABLE public.discovery_classification_log ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.discovery_classification_log IS
  'LLM classification audit log từ discovery-rss-news. 30 ngày TTL.';
