-- Fix yesterday's data (09/11) with correct value
UPDATE daily_view_stats2 
SET view_count = 845, updated_at = now()
WHERE view_date = '2025-11-09';

-- Create entry for today (10/11) 
INSERT INTO daily_view_stats2 (view_date, view_count, updated_at)
VALUES ('2025-11-10', 0, now())
ON CONFLICT (view_date) DO UPDATE SET view_count = 0, updated_at = now();