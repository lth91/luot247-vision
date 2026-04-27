CREATE OR REPLACE VIEW public.http_recent_errors AS
SELECT
  r.id,
  r.status_code,
  r.created,
  r.content::text AS full_content
FROM net._http_response r
WHERE r.created > now() - interval '6 hours'
  AND r.status_code IN (400, 500, 502, 503, 546)
ORDER BY r.created DESC;

GRANT SELECT ON public.http_recent_errors TO anon, authenticated;
