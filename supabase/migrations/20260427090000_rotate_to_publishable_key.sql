-- Rotate pg_cron call functions tới sb_publishable_* key (thay JWT cũ).
-- Tất cả edge functions có verify_jwt=false → chỉ cần apikey header cho gateway,
-- không cần Authorization Bearer service_role.
-- Publishable key là public-safe (giống anon, RLS protects), an toàn để commit.

CREATE OR REPLACE FUNCTION public.call_crawl_electricity_news()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://gklpvaindbfkcmuuuffz.supabase.co/functions/v1/crawl-electricity-news',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_59MPtkp-OomPq0A4RdtX9A_4AsLLzO7'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.call_discovery_rss_news()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://gklpvaindbfkcmuuuffz.supabase.co/functions/v1/discovery-rss-news',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_59MPtkp-OomPq0A4RdtX9A_4AsLLzO7'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.call_daily_auto_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://gklpvaindbfkcmuuuffz.supabase.co/functions/v1/daily-auto-views',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_59MPtkp-OomPq0A4RdtX9A_4AsLLzO7'
    ),
    body := '{}'::jsonb
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to call daily-auto-views: %', SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.call_backfill_summaries()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://gklpvaindbfkcmuuuffz.supabase.co/functions/v1/backfill-summaries',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_59MPtkp-OomPq0A4RdtX9A_4AsLLzO7'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
END;
$$;

-- Re-schedule update-daily-stats cron không dùng auth header cũ
DO $$
BEGIN
  PERFORM cron.unschedule('update-daily-view-stats');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('daily-update-stats');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'daily-update-stats',
  '5 0 * * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://gklpvaindbfkcmuuuffz.supabase.co/functions/v1/update-daily-stats',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_59MPtkp-OomPq0A4RdtX9A_4AsLLzO7'
    ),
    body := '{}'::jsonb
  );
  $cmd$
);
