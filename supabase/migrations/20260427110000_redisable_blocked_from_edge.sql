-- Re-enable test (20260427100000) cho The Leader & CPC failed:
-- Site phục hồi với residential IP nhưng block/timeout từ Supabase Edge Function infrastructure.
-- - The Leader: HTTP 403 từ Edge IP (anti-bot fingerprint Supabase data center)
-- - CPC: signal aborted (timeout — RSS endpoint chậm từ Edge → cpc.vn)
-- Để re-enable cần proxy hoặc Playwright với residential IP.

UPDATE public.electricity_sources
SET is_active = false,
    last_error = 'HTTP 403 from Supabase Edge IP (works from residential IP, anti-bot fingerprint)'
WHERE name = 'The Leader';

UPDATE public.electricity_sources
SET is_active = false,
    last_error = 'RSS endpoint timeout from Supabase Edge → VN (works from local)',
    feed_type = 'html_list',
    list_url = 'https://cpc.vn/vi-vn/',
    list_link_pattern = '/vi-vn/Tin-tuc/.*'
WHERE name = 'EVN miền Trung (CPC)';
