-- Reset all base stats to 0 to start fresh
UPDATE public.view_stats_base 
SET stat_value = 0, updated_at = now()
WHERE stat_key IN (
  'base_total',
  'base_yesterday', 
  'base_today',
  'base_week',
  'base_month'
);

-- Verify the reset
SELECT stat_key, stat_value, updated_at 
FROM public.view_stats_base 
ORDER BY stat_key;
