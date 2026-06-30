-- Chuyển vertical tin điện (/d) từ AI crawl → USER gửi tin (giống trang chủ).
-- 1) Dừng toàn bộ cron pipeline AI (GIỮ nguyên tin cũ trong electricity_news).
-- 2) electricity_news thêm cột cho user gửi + tự set title_normalized.
-- 3) RPC dedup title điện. 4) Chấm điểm +10 (chung kho điểm). 5) status off-topic.

-- ===== 1) Dừng cron AI (tin cũ giữ nguyên) =====
DO $$
DECLARE j text;
BEGIN
  FOREACH j IN ARRAY ARRAY[
    'crawl-electricity-news-hourly','discovery-rss-news-hourly','discover-candidates-daily',
    'auto-fix-selector-daily','pending-playwright-lifecycle','pipeline-health-check-6h',
    'autonomy-digest-daily'
  ] LOOP
    BEGIN PERFORM cron.unschedule(j); EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;
END $$;

-- ===== 2) Cột mới cho user gửi =====
ALTER TABLE public.electricity_news
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_approved boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_classification jsonb;

COMMENT ON COLUMN public.electricity_news.submitted_by IS 'User gửi tin (NULL = tin AI crawl cũ). Dùng chấm điểm.';
COMMENT ON COLUMN public.electricity_news.ai_classification IS 'Raw JSON LLM (giọng AI, plausibility, is_electricity) để hậu kiểm.';

-- title_normalized tự set khi insert nếu null (mirror news_set_title_normalized).
CREATE OR REPLACE FUNCTION public.electricity_news_set_title_normalized()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  IF NEW.title_normalized IS NULL AND NEW.title IS NOT NULL THEN
    NEW.title_normalized := public.normalize_title_for_similarity(NEW.title);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_electricity_news_set_title_normalized ON public.electricity_news;
CREATE TRIGGER trg_electricity_news_set_title_normalized
  BEFORE INSERT OR UPDATE ON public.electricity_news
  FOR EACH ROW EXECUTE FUNCTION public.electricity_news_set_title_normalized();

-- ===== 3) RPC dedup title điện (trigram, ngưỡng 0.7) =====
CREATE OR REPLACE FUNCTION public.find_similar_electricity_title(
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
  IF v_norm IS NULL OR length(v_norm) < 20 THEN
    RETURN NULL;
  END IF;
  PERFORM set_limit(_threshold);
  SELECT id INTO v_id
  FROM public.electricity_news
  WHERE title_normalized IS NOT NULL
    AND is_duplicate_of IS NULL
    AND title_normalized % v_norm
    AND extensions.similarity(title_normalized, v_norm) >= _threshold
  ORDER BY extensions.similarity(title_normalized, v_norm) DESC
  LIMIT 1;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.find_similar_electricity_title(text, real) FROM anon, authenticated, public;

-- ===== 4) Chấm điểm: +10 khi user gửi tin điện; -5 khi admin gỡ (chung kho điểm) =====
CREATE OR REPLACE FUNCTION public.award_points_on_electricity_news()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    IF NEW.submitted_by IS NOT NULL THEN
      UPDATE public.profiles
      SET submitted_count = submitted_count + 1,
          approved_count  = approved_count + (CASE WHEN NEW.is_approved THEN 1 ELSE 0 END),
          total_points    = total_points + (CASE WHEN NEW.is_approved THEN 10 ELSE 0 END)
      WHERE id = NEW.submitted_by;
    END IF;
  ELSIF (TG_OP = 'UPDATE') THEN
    IF NEW.submitted_by IS NOT NULL
       AND OLD.is_approved = true AND NEW.is_approved = false THEN
      UPDATE public.profiles
      SET rejected_count = rejected_count + 1,
          total_points   = GREATEST(0, total_points - 5)
      WHERE id = NEW.submitted_by;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_award_points_on_electricity_news ON public.electricity_news;
CREATE TRIGGER trg_award_points_on_electricity_news
  AFTER INSERT OR UPDATE OF is_approved ON public.electricity_news
  FOR EACH ROW EXECUTE FUNCTION public.award_points_on_electricity_news();

-- ===== 5) Thêm status rejected_offtopic (tin lạc đề ngành điện) =====
ALTER TABLE public.submission_log DROP CONSTRAINT IF EXISTS submission_log_status_check;
ALTER TABLE public.submission_log ADD CONSTRAINT submission_log_status_check
  CHECK (status IN (
    'accepted','rejected_length','rejected_duplicate','rejected_similar',
    'rejected_ai','rejected_implausible','rejected_offtopic','error'
  ));
