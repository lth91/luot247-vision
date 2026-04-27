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
