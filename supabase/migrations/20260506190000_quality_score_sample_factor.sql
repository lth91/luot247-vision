-- Cải tiến compute_source_quality_score: thêm sample_factor để source mới
-- (Phase E auto-handover hoặc manual add) không nhảy vọt lên top quality
-- ranking khi mới có 1-2 bài đầu.
--
-- Formula cũ:
--   score = (articles_30d / (1 + days_since)) × active_factor × tier_weight
--
-- Formula mới:
--   sample_factor = LEAST(1.0, articles_30d / 5.0)
--   score = base × active_factor × tier_weight × sample_factor
--
-- Hiệu ứng:
--   - Source 1 bài: sample_factor = 0.2 → score ×0.2 (penalty)
--   - Source 3 bài: sample_factor = 0.6
--   - Source 5+ bài: sample_factor = 1.0 (full score)
--
-- Phase E vừa promote (24h, có 1-3 bài) sẽ có score thực tế thay vì
-- inflated. Sau khi accumulate đủ sample sẽ tự ramp up natural.

CREATE OR REPLACE FUNCTION public.compute_source_quality_score(p_source_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_articles_30d int;
  v_last_article timestamptz;
  v_days_since numeric;
  v_active boolean;
  v_tier int;
  v_active_factor numeric;
  v_tier_weight numeric;
  v_sample_factor numeric;
  v_base numeric;
BEGIN
  SELECT is_active, tier INTO v_active, v_tier
  FROM public.electricity_sources WHERE id = p_source_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  SELECT count(*), max(crawled_at)
    INTO v_articles_30d, v_last_article
  FROM public.electricity_news
  WHERE source_id = p_source_id
    AND crawled_at > now() - interval '30 days'
    AND is_duplicate_of IS NULL;

  v_days_since := COALESCE(EXTRACT(EPOCH FROM (now() - v_last_article)) / 86400, 999);
  v_active_factor := CASE WHEN v_active THEN 1.0 ELSE 0.1 END;
  v_tier_weight := CASE v_tier WHEN 1 THEN 1.5 WHEN 2 THEN 1.2 ELSE 1.0 END;
  v_sample_factor := LEAST(1.0, v_articles_30d::numeric / 5.0);
  v_base := v_articles_30d::numeric / (1 + v_days_since);

  RETURN ROUND((v_base * v_active_factor * v_tier_weight * v_sample_factor)::numeric, 2);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.compute_source_quality_score(uuid) FROM anon, authenticated, public;
