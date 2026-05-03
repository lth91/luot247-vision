-- Phase 3.1 — Title dedup nâng cấp từ exact-set hash sang trigram similarity.
-- Lý do: Phase 3 (md5 của tập từ ≥3 ký tự sorted) đòi exact match → bỏ sót case
-- 2 nguồn cùng tin nhưng 1 nguồn thêm prefix nguồn (vd "Hàn Quốc:", "VIDEO:",
-- "EVN:", "Cập nhật:"). Audit 03/05: 2 bài làng điện mặt trời Hàn Quốc trùng nội
-- dung từ icon.com.vn vs vietnamnet.vn không bị dedup vì khác 2 từ ("han", "quoc").
--
-- Hướng A từ user discussion: dùng pg_trgm similarity trên title đã lower+unaccent.
-- Threshold 0.7 (tunable) match được paraphrase nhẹ, prefix nguồn, reordering từ
-- nhỏ. Performance OK với GIN trgm index trên 14-day window.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- Cột mới: title đã lower + unaccent (raw, không hash) cho similarity matching.
ALTER TABLE public.electricity_news
  ADD COLUMN IF NOT EXISTS title_normalized text;

COMMENT ON COLUMN public.electricity_news.title_normalized IS
  'Title đã lower + unaccent. Dùng cho trigram similarity dedup (pg_trgm). Cập nhật tự động qua trigger.';

CREATE OR REPLACE FUNCTION public.normalize_title_for_similarity(t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT regexp_replace(
    lower(unaccent(coalesce(t, ''))),
    '\s+', ' ', 'g'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.normalize_title_for_similarity(text) FROM anon, authenticated, public;

-- Backfill 14 ngày gần nhất (range hợp lý vs cost — older rows không cần).
UPDATE public.electricity_news
SET title_normalized = public.normalize_title_for_similarity(title)
WHERE title_normalized IS NULL
  AND crawled_at > now() - interval '14 days';

-- Index GIN trgm cho similarity search nhanh.
CREATE INDEX IF NOT EXISTS idx_electricity_news_title_normalized_trgm
  ON public.electricity_news
  USING GIN (title_normalized extensions.gin_trgm_ops)
  WHERE is_duplicate_of IS NULL AND title_normalized IS NOT NULL;

-- Cập nhật trigger để set CẢ hash cũ + normalized mới (giữ hash cũ làm backup,
-- không break code nào dùng nó nếu tương lai có).
CREATE OR REPLACE FUNCTION public.electricity_news_set_title_hash()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF (TG_OP = 'INSERT')
     OR (TG_OP = 'UPDATE' AND NEW.title IS DISTINCT FROM OLD.title)
     OR NEW.title_normalized_hash IS NULL THEN
    NEW.title_normalized_hash := public.normalize_title_for_hash(NEW.title);
    NEW.title_normalized := public.normalize_title_for_similarity(NEW.title);
  END IF;
  RETURN NEW;
END;
$$;

-- Rewrite dedup function dùng trigram similarity.
-- Strategy:
--   1. Iterate rows is_duplicate_of IS NULL trong 14 ngày, theo canonical order
--      (tier ASC, published ASC, crawled ASC) → winner luôn được process trước.
--   2. Cho mỗi row, tìm winner candidate là row khác cũng is_duplicate_of IS NULL
--      có similarity ≥ threshold VÀ rank cao hơn.
--   3. Nếu tìm thấy → mark row hiện tại là duplicate_of winner.
--
-- Updates trong loop visible cho subsequent iterations (PL/pgSQL same-tx),
-- nên row đã mark dup tự loại khỏi candidate pool.
CREATE OR REPLACE FUNCTION public.dedup_electricity_news()
RETURNS TABLE(deduped_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_count int := 0;
  v_threshold real := 0.7;
  rec record;
  v_winner_id uuid;
BEGIN
  -- Set per-session similarity threshold cho `%` operator (gán default cho query).
  PERFORM set_limit(v_threshold);

  FOR rec IN
    SELECT id, title_normalized, tier, published_at, crawled_at
    FROM public.electricity_news
    WHERE is_duplicate_of IS NULL
      AND title_normalized IS NOT NULL
      AND length(title_normalized) >= 20  -- skip title quá ngắn (hay false positive)
      AND crawled_at > now() - interval '14 days'
    ORDER BY tier ASC NULLS LAST,
             published_at ASC NULLS LAST,
             crawled_at ASC
  LOOP
    SELECT id INTO v_winner_id
    FROM public.electricity_news
    WHERE is_duplicate_of IS NULL
      AND title_normalized IS NOT NULL
      AND id <> rec.id
      AND title_normalized % rec.title_normalized
      AND extensions.similarity(title_normalized, rec.title_normalized) >= v_threshold
      AND (
        COALESCE(tier, 99) < COALESCE(rec.tier, 99)
        OR (COALESCE(tier, 99) = COALESCE(rec.tier, 99) AND COALESCE(published_at, '1970-01-01'::timestamptz) < COALESCE(rec.published_at, '1970-01-01'::timestamptz))
        OR (COALESCE(tier, 99) = COALESCE(rec.tier, 99) AND COALESCE(published_at, '1970-01-01'::timestamptz) = COALESCE(rec.published_at, '1970-01-01'::timestamptz) AND crawled_at < rec.crawled_at)
      )
    ORDER BY tier ASC NULLS LAST,
             published_at ASC NULLS LAST,
             crawled_at ASC
    LIMIT 1;

    IF v_winner_id IS NOT NULL THEN
      UPDATE public.electricity_news
      SET is_duplicate_of = v_winner_id
      WHERE id = rec.id;
      v_count := v_count + 1;
      v_winner_id := NULL;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dedup_electricity_news() FROM anon, authenticated, public;

-- Run once để dedup batch hiện tại (bắt được case Hàn Quốc làng điện mặt trời).
SELECT public.dedup_electricity_news();
