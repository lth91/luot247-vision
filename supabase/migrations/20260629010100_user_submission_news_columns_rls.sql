-- PR A — Pipeline tin do user gửi: cột mới trên `news`, dedup, siết RLS.
-- (Migration enum 20260629010000 đã commit trước file này.)

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

-- 1) Cột mới trên news -------------------------------------------------------
ALTER TABLE public.news
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS url_hash text,
  ADD COLUMN IF NOT EXISTS title_normalized text,
  ADD COLUMN IF NOT EXISTS ai_classification jsonb;

COMMENT ON COLUMN public.news.submitted_by IS 'User gửi tin (NULL = tin admin/import). Dùng cho chấm điểm.';
COMMENT ON COLUMN public.news.url_hash IS 'SHA-256 hex của URL đã canonicalize. Dedup nguồn trùng.';
COMMENT ON COLUMN public.news.title_normalized IS 'Title lower+unaccent+collapse-space. Dùng trigram similarity dedup.';
COMMENT ON COLUMN public.news.ai_classification IS 'Raw JSON output LLM (giọng AI, plausibility, category) để admin hậu kiểm.';

-- Dedup URL: unique khi có url_hash (tin cũ url_hash NULL không bị ràng buộc).
CREATE UNIQUE INDEX IF NOT EXISTS idx_news_url_hash_unique
  ON public.news (url_hash)
  WHERE url_hash IS NOT NULL;

-- 2) Dedup title bằng trigram (tái dùng normalize_title_for_similarity đã có
--    từ migration 20260505080000_trigram_title_dedup.sql) -------------------
CREATE INDEX IF NOT EXISTS idx_news_title_normalized_trgm
  ON public.news
  USING GIN (title_normalized extensions.gin_trgm_ops)
  WHERE title_normalized IS NOT NULL;

-- Trigger tự set title_normalized khi insert/update title.
CREATE OR REPLACE FUNCTION public.news_set_title_normalized()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  IF (TG_OP = 'INSERT')
     OR (TG_OP = 'UPDATE' AND NEW.title IS DISTINCT FROM OLD.title)
     OR NEW.title_normalized IS NULL THEN
    NEW.title_normalized := public.normalize_title_for_similarity(NEW.title);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_news_set_title_normalized ON public.news;
CREATE TRIGGER trg_news_set_title_normalized
  BEFORE INSERT OR UPDATE ON public.news
  FOR EACH ROW EXECUTE FUNCTION public.news_set_title_normalized();

-- Backfill title_normalized cho tin hiện có (để dedup so cả với tin cũ).
UPDATE public.news
SET title_normalized = public.normalize_title_for_similarity(title)
WHERE title_normalized IS NULL;

-- 3) Siết RLS news (BẮT BUỘC vì auto-publish) -------------------------------
-- Trước: "Authenticated users can insert/update/delete" → MỌI user auth ghi
-- thẳng được → bypass kiểm duyệt qua supabase client. Đổi về admin/moderator.
-- User thường chỉ gửi tin qua edge function submit-news (chạy service_role,
-- bỏ qua RLS). SELECT vẫn public.
DROP POLICY IF EXISTS "Authenticated users can insert news" ON public.news;
DROP POLICY IF EXISTS "Authenticated users can update news" ON public.news;
DROP POLICY IF EXISTS "Authenticated users can delete news" ON public.news;
DROP POLICY IF EXISTS "Admins/mods can insert news" ON public.news;
DROP POLICY IF EXISTS "Admins/mods can update news" ON public.news;
DROP POLICY IF EXISTS "Admins/mods can delete news" ON public.news;

CREATE POLICY "Admins/mods can insert news" ON public.news
  FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

CREATE POLICY "Admins/mods can update news" ON public.news
  FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

CREATE POLICY "Admins/mods can delete news" ON public.news
  FOR DELETE
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));
