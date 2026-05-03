-- Phase 3 — Content dedup via normalized title hash.
-- Same article from EVN + RSS Discovery rebroadcast hiện đang xuất hiện 2-3 lần.
-- Dedup logic: hash tập từ ≥3 ký tự (đã lower + unaccent) sorted alpha → match exact.
-- Catch: reordering, punctuation, diacritics. Không catch: paraphrase substantial.

-- 1. unaccent extension cho lower-diacritic. Tier 1 schema cho phép.
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

-- 2. Cột mới
ALTER TABLE public.electricity_news
  ADD COLUMN IF NOT EXISTS title_normalized_hash text,
  ADD COLUMN IF NOT EXISTS is_duplicate_of uuid REFERENCES public.electricity_news(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.electricity_news.title_normalized_hash IS
  'MD5 của tập từ ≥3 ký tự sorted alpha (lower + unaccent). Đồng nhất giữa các bài cùng tin.';
COMMENT ON COLUMN public.electricity_news.is_duplicate_of IS
  'Nếu bài là duplicate, trỏ về winner (tier thấp nhất, published sớm nhất). Frontend filter NULL để chỉ show 1 bài/group.';

-- 3. Function normalize: lower → unaccent → split → filter ≥3 chars → distinct → sort → md5
CREATE OR REPLACE FUNCTION public.normalize_title_for_hash(t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT md5(string_agg(DISTINCT word, ' ' ORDER BY word))
  FROM unnest(
    string_to_array(
      regexp_replace(
        lower(unaccent(coalesce(t, ''))),
        '[^a-z0-9 ]+', ' ', 'g'
      ),
      ' '
    )
  ) AS word
  WHERE length(word) >= 3;
$$;

-- 4. Backfill 350 rows hiện có
UPDATE public.electricity_news
SET title_normalized_hash = public.normalize_title_for_hash(title)
WHERE title_normalized_hash IS NULL;

-- 5. Trigger: auto-set hash on insert + update title
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
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_electricity_news_set_title_hash ON public.electricity_news;
CREATE TRIGGER trg_electricity_news_set_title_hash
  BEFORE INSERT OR UPDATE OF title ON public.electricity_news
  FOR EACH ROW
  EXECUTE FUNCTION public.electricity_news_set_title_hash();

-- 6. Index — partial trên non-duplicate để dedup query nhanh
CREATE INDEX IF NOT EXISTS idx_electricity_news_title_hash_active
  ON public.electricity_news (title_normalized_hash)
  WHERE is_duplicate_of IS NULL AND title_normalized_hash IS NOT NULL;

-- 7. Function dedup: trong group cùng hash, giữ winner (tier thấp nhất, sớm nhất),
--    soft-mark phần còn lại bằng is_duplicate_of = winner_id.
CREATE OR REPLACE FUNCTION public.dedup_electricity_news()
RETURNS TABLE(deduped_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count int;
BEGIN
  WITH ranked AS (
    SELECT
      id,
      title_normalized_hash,
      ROW_NUMBER() OVER (
        PARTITION BY title_normalized_hash
        ORDER BY tier ASC NULLS LAST,
                 published_at ASC NULLS LAST,
                 crawled_at ASC
      ) AS rn,
      FIRST_VALUE(id) OVER (
        PARTITION BY title_normalized_hash
        ORDER BY tier ASC NULLS LAST,
                 published_at ASC NULLS LAST,
                 crawled_at ASC
      ) AS winner_id
    FROM public.electricity_news
    WHERE title_normalized_hash IS NOT NULL
      AND is_duplicate_of IS NULL
      AND crawled_at > now() - interval '14 days'
  )
  UPDATE public.electricity_news n
  SET is_duplicate_of = r.winner_id
  FROM ranked r
  WHERE n.id = r.id
    AND r.rn > 1;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT v_count;
END;
$$;

-- 8. Lock down execute (cron + service_role only, không cho anon/authenticated)
REVOKE EXECUTE ON FUNCTION public.normalize_title_for_hash(text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.dedup_electricity_news() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.electricity_news_set_title_hash() FROM anon, authenticated, public;

-- 9. Run once để clean existing duplicates
SELECT public.dedup_electricity_news();

-- 10. Schedule cron 20 phút mỗi 6 giờ (lệch khỏi crawl :00, discovery :30, health :45, daily report,
--     reenable :50). Trùng nothing.
DO $$ BEGIN
  PERFORM cron.unschedule('dedup-electricity-news-6h');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'dedup-electricity-news-6h',
  '20 */6 * * *',
  $$SELECT public.dedup_electricity_news();$$
);
