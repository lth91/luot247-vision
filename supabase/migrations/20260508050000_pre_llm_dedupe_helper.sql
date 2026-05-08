-- Helper RPC để check fuzzy title duplicate TRƯỚC khi gọi LLM.
-- dedup_electricity_news() chạy post-insert đã tốt nhưng không ngăn được token spend.
-- Function này dùng cùng pg_trgm threshold 0.7 (giống dedup_electricity_news), chỉ
-- query trả id existing match nếu có. Edge function gọi RPC này trước summarize call.
--
-- Window 7 ngày: đủ catch cùng sự kiện lan ra nhiều nguồn (vd Quảng Trạch đốt than
-- 1 ngày 9 nguồn lặp), không quá rộng để khỏi false-positive với headline tái dùng.

CREATE OR REPLACE FUNCTION public.find_similar_existing_title(
  candidate_title text,
  window_days int DEFAULT 7
)
RETURNS TABLE(id uuid, title text, similarity real)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_norm text;
BEGIN
  v_norm := public.normalize_title_for_similarity(candidate_title);
  -- Title quá ngắn dễ false-positive trên trgm → bỏ qua check (để dedup post-insert lo)
  IF v_norm IS NULL OR length(v_norm) < 20 THEN
    RETURN;
  END IF;

  PERFORM set_limit(0.7);

  RETURN QUERY
  SELECT
    e.id,
    e.title,
    extensions.similarity(e.title_normalized, v_norm) AS sim
  FROM public.electricity_news e
  WHERE e.is_duplicate_of IS NULL
    AND e.title_normalized IS NOT NULL
    AND e.crawled_at > now() - make_interval(days => window_days)
    AND e.title_normalized % v_norm
    AND extensions.similarity(e.title_normalized, v_norm) >= 0.7
  ORDER BY sim DESC
  LIMIT 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.find_similar_existing_title(text, int) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.find_similar_existing_title(text, int) TO service_role;
