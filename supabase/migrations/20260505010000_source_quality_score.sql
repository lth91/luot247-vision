-- Phase D — Source quality score + auto-cleanup infrastructure.
--
-- Mục tiêu:
--  • Score per source (volume × freshness × tier weight)
--  • Backfill disabled_at từ source_event_log (Phase C đã log events)
--  • Function compute_quality_score(source_id)
--  • Schedule cron source-cleanup-daily lúc 02:30 UTC
--    (sau crawl 02:00, trước daily-report 07:00 đầu tiên trong ngày có cleanup data)

-- 1. Cột mới
ALTER TABLE public.electricity_sources
  ADD COLUMN IF NOT EXISTS disabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS quality_score numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.electricity_sources.disabled_at IS
  'Thời điểm gần nhất source chuyển active=false. NULL nếu chưa disable.';
COMMENT ON COLUMN public.electricity_sources.quality_score IS
  'Score tính bởi compute_source_quality_score(). Recompute mỗi cron source-cleanup.';

-- 2. Backfill disabled_at từ source_event_log (events 'disabled')
UPDATE public.electricity_sources s
SET disabled_at = sub.last_disabled
FROM (
  SELECT source_id, max(created_at) AS last_disabled
  FROM public.source_event_log
  WHERE event_type = 'disabled'
  GROUP BY source_id
) sub
WHERE s.id = sub.source_id
  AND s.is_active = false
  AND s.disabled_at IS NULL;

-- Fallback cho sources disabled từ trước Phase C (không có event log):
-- dùng last_crawled_at làm proxy (gần đúng).
UPDATE public.electricity_sources
SET disabled_at = last_crawled_at
WHERE is_active = false
  AND disabled_at IS NULL
  AND last_crawled_at IS NOT NULL;

-- 3. Trigger: set disabled_at khi UPDATE is_active true→false
CREATE OR REPLACE FUNCTION public.electricity_sources_track_disabled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.is_active = true AND NEW.is_active = false THEN
    NEW.disabled_at := now();
  ELSIF OLD.is_active = false AND NEW.is_active = true THEN
    NEW.disabled_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_electricity_sources_track_disabled ON public.electricity_sources;
CREATE TRIGGER trg_electricity_sources_track_disabled
  BEFORE UPDATE OF is_active ON public.electricity_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.electricity_sources_track_disabled();

-- 4. Function compute_source_quality_score
-- Formula:
--   base = articles_30d / (1 + days_since_last_article)
--   active_factor = 1 if active else 0.1
--   tier_weight = 1.5 if tier=1, 1.2 if tier=2, 1.0 otherwise
--   score = base × active_factor × tier_weight
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
  v_base := v_articles_30d::numeric / (1 + v_days_since);

  RETURN ROUND((v_base * v_active_factor * v_tier_weight)::numeric, 2);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.compute_source_quality_score(uuid) FROM anon, authenticated, public;

-- 5. RPC để cron call edge function (sẽ tạo sau khi function deploy)
-- Tương tự pattern của call_health_check, call_daily_report.
CREATE OR REPLACE FUNCTION public.call_source_cleanup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_supabase_url text := 'https://gklpvaindbfkcmuuuffz.supabase.co';
  v_service_role_key text;
  v_headers jsonb;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_service_role_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key';
  EXCEPTION
    WHEN OTHERS THEN
      v_service_role_key := NULL;
  END;

  IF v_service_role_key IS NULL THEN
    RAISE EXCEPTION 'service_role_key vault secret missing';
  END IF;

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_service_role_key,
    'apikey', v_service_role_key
  );

  PERFORM net.http_post(
    url := v_supabase_url || '/functions/v1/source-cleanup',
    headers := v_headers,
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.call_source_cleanup() FROM anon, authenticated, public;

-- 6. Audit table cho auto-actions của cleanup. KHÔNG FK tới electricity_sources
-- để row survives sau khi source bị DELETE. Dùng cho daily-report query 24h.
CREATE TABLE IF NOT EXISTS public.source_cleanup_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL CHECK (action IN ('auto_disabled', 'auto_deleted')),
  source_id uuid,  -- nullable, no FK
  source_name text NOT NULL,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_source_cleanup_audit_created
  ON public.source_cleanup_audit (created_at DESC);

ALTER TABLE public.source_cleanup_audit ENABLE ROW LEVEL SECURITY;

-- 7. Schedule cron 02:30 UTC daily.
DO $$ BEGIN
  PERFORM cron.unschedule('source-cleanup-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'source-cleanup-daily',
  '30 2 * * *',
  $$SELECT public.call_source_cleanup();$$
);
