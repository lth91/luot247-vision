-- ============================================================================
-- CLEANUP IRAN DASHBOARD — paste vào Supabase SQL Editor và RUN để xoá sạch
-- ============================================================================
-- An toàn: chỉ xoá các object mà setup_iran_dashboard.sql đã tạo.
-- Không đụng đến bảng/view/function nào khác của project.
-- ============================================================================

-- 1. Xoá cron jobs
DO $$ BEGIN PERFORM cron.unschedule('iran-fetch-news');     EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('iran-fetch-gdelt');    EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('iran-build-timeline'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 2. Xoá function helper
DROP FUNCTION IF EXISTS public.call_iran_edge(text);

-- 3. Gỡ bảng khỏi publication realtime
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'iran_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.iran_events;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'iran_stats'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.iran_stats;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'news_iran'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.news_iran;
  END IF;
END $$;

-- 4. Drop bảng (thứ tự: iran_events trước vì FK → news_iran)
DROP TABLE IF EXISTS public.iran_events CASCADE;
DROP TABLE IF EXISTS public.iran_stats  CASCADE;
DROP TABLE IF EXISTS public.news_iran   CASCADE;

-- 5. Xoá các HTTP response log của iran calls (optional — chỉ để giữ bảng net._http_response gọn)
DELETE FROM net._http_response
WHERE content::text LIKE '%Invalid JWT%'
   OR content::text LIKE '%iran%';

-- Verify
SELECT 'Done. No iran tables remain.' AS status
WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema = 'public'
                    AND table_name IN ('news_iran','iran_events','iran_stats'));
