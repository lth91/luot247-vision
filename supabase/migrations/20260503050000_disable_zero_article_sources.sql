-- Disable electricity sources that have produced 0 articles ever despite being is_active=true.
-- These are the 12 sources flagged by the 2026-05-03 audit. The crawler logic fix in
-- 20260503060000 will start incrementing consecutive_failures on zero-link runs going forward.

UPDATE public.electricity_sources s
SET
  is_active = false,
  last_error = COALESCE(NULLIF(s.last_error, ''), 'auto-disabled: 0 articles ever produced (2026-05-03 audit)')
WHERE s.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM public.electricity_news n WHERE n.source_id = s.id
  );
