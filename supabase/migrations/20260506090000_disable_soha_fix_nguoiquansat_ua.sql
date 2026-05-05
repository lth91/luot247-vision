-- Manual disable soha.vn: RSS https://soha.vn/rss/home.rss never produced
-- valid candidates (0 articles total, 6 consecutive failures with
-- "no candidates parsed from rss list"). Stop Telegram alert noise; auto
-- re-enable cron must not flip this back, hence the explicit manual marker
-- in last_error.
UPDATE electricity_sources
SET is_active = false,
    last_error = 'manual disable: RSS home.rss never produced valid candidates (0 articles total)',
    disabled_at = now()
WHERE id = 'b15edda9-283c-4f3f-91e4-7c398e5b8061';

-- Mac Mini (nguoiquansat.vn): Playwright source, 1 successful article today
-- (04:26) then HTTP 403 burst (anti-bot). scraper_config previously had no
-- user_agent → scraper falls back to default UA which Cloudflare flags.
-- Use Googlebot UA (same strategy as evnhcmc in luot247-scraper sources.py).
UPDATE electricity_sources
SET scraper_config = COALESCE(scraper_config, '{}'::jsonb) || jsonb_build_object(
      'user_agent',
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
    ),
    consecutive_failures = 0,
    last_error = NULL
WHERE id = 'dc1530a1-f83c-4c8e-82b5-b500165d9e3e';
