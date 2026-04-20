-- Iran War Dashboard: news, events, stats tables
-- Tách khỏi bảng `news` hiện có vì cần cột source/external_id/lat-lng và pipeline tự động không qua duyệt

-- =============================================================================
-- 1. Bảng tin tức Iran (fetch từ RSS + GDELT)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.news_iran (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT UNIQUE NOT NULL,      -- sha256(url) dùng để dedupe
  title TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  source TEXT NOT NULL,                  -- 'reuters' | 'ap' | 'bbc' | 'cnn' | 'aljazeera' | 'gdelt'
  source_name TEXT,                      -- hiển thị UI: "Reuters", "BBC News"
  author TEXT,
  image_url TEXT,
  published_at TIMESTAMPTZ NOT NULL,
  fetched_at TIMESTAMPTZ DEFAULT now(),
  category TEXT,                         -- 'strike' | 'diplomacy' | 'casualty' | 'statement' | 'other'
  severity SMALLINT DEFAULT 0,           -- 0-5
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  location_name TEXT,
  raw JSONB
);

CREATE INDEX IF NOT EXISTS idx_news_iran_published_at ON public.news_iran (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_iran_source ON public.news_iran (source);
CREATE INDEX IF NOT EXISTS idx_news_iran_category ON public.news_iran (category);
CREATE INDEX IF NOT EXISTS idx_news_iran_severity ON public.news_iran (severity DESC);

-- =============================================================================
-- 2. Bảng sự kiện timeline (gom từ news_iran)
-- =============================================================================
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
CREATE INDEX IF NOT EXISTS idx_iran_events_event_type ON public.iran_events (event_type);

-- =============================================================================
-- 3. Bảng counters/stats cho dashboard
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.iran_stats (
  stat_key TEXT PRIMARY KEY,
  stat_value NUMERIC NOT NULL DEFAULT 0,
  label TEXT,
  icon TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed các counters mặc định
INSERT INTO public.iran_stats (stat_key, stat_value, label, icon) VALUES
  ('strikes_total',       0, 'Strikes reported',    'crosshair'),
  ('casualties_reported', 0, 'Casualties reported', 'heart-pulse'),
  ('diplomacy_events',    0, 'Diplomatic events',   'handshake'),
  ('last_update_unix',    0, 'Last update',         'clock')
ON CONFLICT (stat_key) DO NOTHING;

-- =============================================================================
-- 4. RLS: public read, chỉ service_role ghi
-- =============================================================================
ALTER TABLE public.news_iran   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iran_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iran_stats  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read news_iran"   ON public.news_iran;
DROP POLICY IF EXISTS "public read iran_events" ON public.iran_events;
DROP POLICY IF EXISTS "public read iran_stats"  ON public.iran_stats;

CREATE POLICY "public read news_iran"   ON public.news_iran   FOR SELECT USING (true);
CREATE POLICY "public read iran_events" ON public.iran_events FOR SELECT USING (true);
CREATE POLICY "public read iran_stats"  ON public.iran_stats  FOR SELECT USING (true);

-- =============================================================================
-- 5. Realtime publication
-- =============================================================================
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

-- =============================================================================
-- 6. Cron jobs (pg_cron) — cần bật extension pg_cron + pg_net trong Supabase dashboard
-- =============================================================================
-- LƯU Ý: Thay <PROJECT_REF> và <ANON_KEY> bằng giá trị thực của project.
--        Có thể chạy đoạn này thủ công sau khi deploy edge functions.
--
-- SELECT cron.schedule(
--   'fetch-iran-news',
--   '*/2 * * * *',
--   $$
--     SELECT net.http_post(
--       url := 'https://<PROJECT_REF>.functions.supabase.co/fetch-iran-news',
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'Authorization', 'Bearer <ANON_KEY>'
--       ),
--       body := '{}'::jsonb
--     );
--   $$
-- );
--
-- SELECT cron.schedule(
--   'fetch-gdelt-iran',
--   '*/5 * * * *',
--   $$
--     SELECT net.http_post(
--       url := 'https://<PROJECT_REF>.functions.supabase.co/fetch-gdelt-iran',
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'Authorization', 'Bearer <ANON_KEY>'
--       ),
--       body := '{}'::jsonb
--     );
--   $$
-- );
--
-- SELECT cron.schedule(
--   'build-iran-timeline',
--   '*/10 * * * *',
--   $$
--     SELECT net.http_post(
--       url := 'https://<PROJECT_REF>.functions.supabase.co/build-iran-timeline',
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'Authorization', 'Bearer <ANON_KEY>'
--       ),
--       body := '{}'::jsonb
--     );
--   $$
-- );
