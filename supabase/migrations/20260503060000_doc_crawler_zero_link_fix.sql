-- Marker migration: the crawler edge function `crawl-electricity-news` was updated in
-- this commit to count "fetched OK but 0 candidate links" as a failure
-- (consecutive_failures += 1, last_error = 'no candidates parsed').
--
-- Previously the crawler reset consecutive_failures = 0 on any HTTP-200 response
-- regardless of whether parsing yielded any links, so misconfigured selectors / RSS
-- patterns silently kept their is_active=true status. This migration carries no SQL
-- but exists so the migration log records the behavioural change in the same window
-- as the corresponding source disable in 20260503050000.

SELECT 1;
