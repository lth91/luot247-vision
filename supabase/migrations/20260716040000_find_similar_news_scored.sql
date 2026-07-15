-- AI phán xử "vùng xám" trùng tin: RPC trả tin GIỐNG NHẤT kèm ĐIỂM similarity
-- (find_similar_news_title cũ chỉ trả id, không có điểm). Crawler dùng để:
--   sim >= 0.70       → bỏ ngay như cũ, không tốn LLM
--   0.45 <= sim < 0.70 → đính kèm tin nghi trùng vào cú gọi Haiku viết lại,
--                        AI trả thêm is_duplicate (cùng SỰ KIỆN hay chỉ cùng chủ đề)
-- Chỉ so với tin 7 ngày gần nhất: crawler vốn bỏ bài gốc quá 3 ngày tuổi nên
-- trùng sự kiện luôn nằm trong cửa sổ này; thu hẹp giúp query nhẹ hẳn.

CREATE OR REPLACE FUNCTION public.find_similar_news_scored(
  _title text,
  _threshold real DEFAULT 0.45
)
RETURNS TABLE (id uuid, title text, sim real)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_norm text;
BEGIN
  v_norm := public.normalize_title_for_similarity(_title);
  -- Title quá ngắn → similarity nhiễu, bỏ qua như RPC cũ.
  IF v_norm IS NULL OR length(v_norm) < 20 THEN
    RETURN;
  END IF;

  PERFORM set_limit(_threshold);

  RETURN QUERY
  SELECT n.id, n.title,
         extensions.similarity(n.title_normalized, v_norm) AS sim
  FROM public.news n
  WHERE n.title_normalized IS NOT NULL
    AND n.created_at > now() - interval '7 days'
    AND n.title_normalized % v_norm
    AND extensions.similarity(n.title_normalized, v_norm) >= _threshold
  ORDER BY sim DESC
  LIMIT 1;
END;
$$;

-- Chỉ service_role (edge function) gọi; chặn anon/authenticated.
REVOKE EXECUTE ON FUNCTION public.find_similar_news_scored(text, real) FROM anon, authenticated, public;
