-- ============================================================================
-- SETUP IRAN DASHBOARD — paste toàn bộ file này vào Supabase SQL Editor và RUN
-- ----------------------------------------------------------------------------
-- Project ref: gklpvaindbfkcmuuuffz
-- Script này idempotent: chạy nhiều lần cũng an toàn.
--
-- TRƯỚC KHI CHẠY:
--   1. Vào Database → Extensions, bật hai extension: `pg_cron` và `pg_net`.
--   2. Tìm service_role_key ở dashboard: Settings → API → service_role (secret).
--   3. (Optional, khuyên dùng) Lưu key vào Vault:
--        Database → Vault → New secret
--        Name: service_role_key
--        Value: <dán service_role key>
--      Nếu không dùng Vault, dán trực tiếp vào dòng `v_service_role_key := ...`
--      ở STEP 5 bên dưới.
--   4. Deploy 3 edge function trước bằng: bash deploy_iran_functions.sh
-- ============================================================================


-- ============================================================================
-- STEP 1: Bảng news_iran, iran_events, iran_stats
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.news_iran (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  source TEXT NOT NULL,
  source_name TEXT,
  author TEXT,
  image_url TEXT,
  published_at TIMESTAMPTZ NOT NULL,
  fetched_at TIMESTAMPTZ DEFAULT now(),
  category TEXT,
  severity SMALLINT DEFAULT 0,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  location_name TEXT,
  raw JSONB
);
CREATE INDEX IF NOT EXISTS idx_news_iran_published_at ON public.news_iran (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_iran_source       ON public.news_iran (source);
CREATE INDEX IF NOT EXISTS idx_news_iran_category     ON public.news_iran (category);
CREATE INDEX IF NOT EXISTS idx_news_iran_severity     ON public.news_iran (severity DESC);

CREATE TABLE IF NOT EXISTS public.iran_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at TIMESTAMPTZ NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  event_type TEXT,
  severity SMALLINT DEFAULT 1,
  location_name TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  source_news_id UUID REFERENCES public.news_iran(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_iran_events_occurred_at ON public.iran_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_iran_events_event_type  ON public.iran_events (event_type);

CREATE TABLE IF NOT EXISTS public.iran_stats (
  stat_key TEXT PRIMARY KEY,
  stat_value NUMERIC NOT NULL DEFAULT 0,
  label TEXT,
  icon TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.iran_stats (stat_key, stat_value, label, icon) VALUES
  ('strikes_total',       0, 'Strikes reported',    'crosshair'),
  ('casualties_reported', 0, 'Casualties reported', 'heart-pulse'),
  ('diplomacy_events',    0, 'Diplomatic events',   'handshake'),
  ('last_update_unix',    0, 'Last update',         'clock')
ON CONFLICT (stat_key) DO NOTHING;


-- ============================================================================
-- STEP 2: Row Level Security — public đọc, chỉ service_role ghi
-- ============================================================================

ALTER TABLE public.news_iran   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iran_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iran_stats  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read news_iran"   ON public.news_iran;
DROP POLICY IF EXISTS "public read iran_events" ON public.iran_events;
DROP POLICY IF EXISTS "public read iran_stats"  ON public.iran_stats;

CREATE POLICY "public read news_iran"   ON public.news_iran   FOR SELECT USING (true);
CREATE POLICY "public read iran_events" ON public.iran_events FOR SELECT USING (true);
CREATE POLICY "public read iran_stats"  ON public.iran_stats  FOR SELECT USING (true);


-- ============================================================================
-- STEP 3: Realtime publication
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'news_iran'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.news_iran;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'iran_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.iran_events;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'iran_stats'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.iran_stats;
  END IF;
END $$;


-- ============================================================================
-- STEP 4: Extensions (nếu chưa bật qua dashboard)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;


-- ============================================================================
-- STEP 5: Hàm gọi edge function qua HTTP
-- ----------------------------------------------------------------------------
-- Theo pattern đã dùng trong call_daily_auto_views.
-- Ưu tiên đọc key từ Vault (name = 'service_role_key').
-- Nếu không có Vault, dán service_role key vào dòng v_service_role_key := '...'.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.call_iran_edge(fn_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_response_id bigint;
  v_supabase_url text := 'https://gklpvaindbfkcmuuuffz.supabase.co';
  v_service_role_key text;
BEGIN
  -- Ưu tiên Vault
  BEGIN
    SELECT decrypted_secret INTO v_service_role_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key';
  EXCEPTION WHEN OTHERS THEN
    v_service_role_key := NULL;
  END;

  -- Fallback: dán service_role key vào đây nếu không dùng Vault
  IF v_service_role_key IS NULL THEN
    v_service_role_key := 'PASTE_SERVICE_ROLE_KEY_HERE';
  END IF;

  SELECT net.http_post(
    url := v_supabase_url || '/functions/v1/' || fn_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_role_key,
      'apikey', v_service_role_key
    ),
    body := '{}'::jsonb
  ) INTO v_response_id;

  RAISE NOTICE 'Called %, request id %', fn_name, v_response_id;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to call %: %', fn_name, SQLERRM;
END;
$$;


-- ============================================================================
-- STEP 6: Cron jobs — xoá job cũ rồi tạo lại cho idempotent
-- ============================================================================

DO $$
BEGIN
  PERFORM cron.unschedule('iran-fetch-news');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('iran-fetch-gdelt');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('iran-build-timeline');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'iran-fetch-news',
  '*/2 * * * *',      -- Mỗi 2 phút: RSS Reuters/AP/BBC/CNN/AlJazeera
  $$ SELECT public.call_iran_edge('fetch-iran-news'); $$
);

SELECT cron.schedule(
  'iran-fetch-gdelt',
  '*/5 * * * *',      -- Mỗi 5 phút: GDELT
  $$ SELECT public.call_iran_edge('fetch-gdelt-iran'); $$
);

SELECT cron.schedule(
  'iran-build-timeline',
  '*/10 * * * *',     -- Mỗi 10 phút: gom event + update counters
  $$ SELECT public.call_iran_edge('build-iran-timeline'); $$
);


-- ============================================================================
-- STEP 7: Chạy NGAY một lần để có dữ liệu ban đầu (không cần đợi 2 phút)
-- ============================================================================

SELECT public.call_iran_edge('fetch-iran-news');
SELECT public.call_iran_edge('fetch-gdelt-iran');
-- timeline cần có news trước, nên đợi khoảng 5s rồi chạy tay dòng dưới:
-- SELECT public.call_iran_edge('build-iran-timeline');


-- ============================================================================
-- KIỂM TRA
-- ============================================================================
-- SELECT count(*), source FROM public.news_iran GROUP BY source;
-- SELECT * FROM cron.job WHERE jobname LIKE 'iran-%';
-- SELECT * FROM public.iran_stats;
