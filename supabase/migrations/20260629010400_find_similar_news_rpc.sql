-- PR backend — RPC dedup title cho edge function submit-news.
-- Đặt logic trong SQL (nơi có unaccent + pg_trgm) thay vì tái tạo unaccent
-- tiếng Việt trong JS. Trả về id tin tương tự nhất (>= threshold) hoặc NULL.

CREATE OR REPLACE FUNCTION public.find_similar_news_title(
  _title text,
  _threshold real DEFAULT 0.7
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_norm text;
  v_id uuid;
BEGIN
  v_norm := public.normalize_title_for_similarity(_title);
  -- Title quá ngắn hay false-positive nhiều → bỏ qua dedup title.
  IF v_norm IS NULL OR length(v_norm) < 20 THEN
    RETURN NULL;
  END IF;

  PERFORM set_limit(_threshold);

  SELECT id INTO v_id
  FROM public.news
  WHERE title_normalized IS NOT NULL
    AND title_normalized % v_norm
    AND extensions.similarity(title_normalized, v_norm) >= _threshold
  ORDER BY extensions.similarity(title_normalized, v_norm) DESC
  LIMIT 1;

  RETURN v_id;
END;
$$;

-- Chỉ service_role (edge function) gọi; chặn anon/authenticated.
REVOKE EXECUTE ON FUNCTION public.find_similar_news_title(text, real) FROM anon, authenticated, public;
