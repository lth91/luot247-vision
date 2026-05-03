-- Lock down SECURITY DEFINER functions that should only be invoked by cron / service_role.
-- Before this migration these were callable via /rest/v1/rpc/<name> by anon + authenticated
-- (advisors 0028 + 0029). EXECUTE remains for postgres + service_role.
--
-- Functions intentionally left executable:
--   - has_role           : invoked from RLS policies, must be callable by authenticated
--   - increment_view_count : called from frontend
--   - handle_new_user, update_updated_at_column : trigger-only utilities, harmless

DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'public.add_view2_logs(integer)',
    'public.backfill_current_stats_distributed()',
    'public.backfill_daily_view_stats(date, date)',
    'public.call_backfill_summaries()',
    'public.call_crawl_electricity_news()',
    'public.call_daily_auto_views()',
    'public.call_daily_report()',
    'public.call_discovery_rss_news()',
    'public.call_health_check()',
    'public.get_current_stats()',
    'public.get_monthly_stats_from_daily()',
    'public.get_or_create_daily_stat(date)',
    'public.get_view2_stats()',
    'public.get_weekly_stats_from_daily()',
    'public.reset_daily_view_stats2()',
    'public.update_daily_view_stats(date)'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated, public', fn);
  END LOOP;
END $$;
