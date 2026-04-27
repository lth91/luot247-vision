-- Tạo view tạm để xem cron job_run_details — diagnose tại sao insert gap 17h.
-- Sẽ DROP sau khi xong diagnose.

CREATE OR REPLACE VIEW public.cron_recent_runs AS
SELECT
  jr.runid,
  j.jobname,
  jr.start_time,
  jr.end_time,
  jr.status,
  jr.return_message
FROM cron.job_run_details jr
JOIN cron.job j ON j.jobid = jr.jobid
WHERE j.jobname IN ('crawl-electricity-news-hourly', 'discovery-rss-news-hourly')
  AND jr.start_time > now() - interval '24 hours'
ORDER BY jr.start_time DESC;

GRANT SELECT ON public.cron_recent_runs TO anon, authenticated;

CREATE OR REPLACE VIEW public.http_recent_responses AS
SELECT
  r.id,
  r.status_code,
  r.created,
  left(r.error_msg, 200) AS error_msg,
  left(r.content::text, 300) AS content_preview
FROM net._http_response r
WHERE r.created > now() - interval '24 hours'
ORDER BY r.created DESC;

GRANT SELECT ON public.http_recent_responses TO anon, authenticated;
