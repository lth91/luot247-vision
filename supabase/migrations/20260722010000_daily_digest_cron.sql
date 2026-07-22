-- Bản tin sáng Telegram (22/07): 8h sáng VN mỗi ngày (01:00 UTC) gọi
-- crawl-health-check với mode daily_digest — chi phí AI hôm qua + phễu tin
-- hôm qua + tồn hàng đợi. LUÔN gửi (khác cron 6h chỉ báo khi có sự cố).

CREATE OR REPLACE FUNCTION public.call_crawl_daily_digest()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
BEGIN
  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  PERFORM net.http_post(
    url := 'https://gklpvaindbfkcmuuuffz.supabase.co/functions/v1/crawl-health-check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(v_key, ''),
      'apikey', COALESCE(v_key, '')
    ),
    body := '{"mode": "daily_digest"}'::jsonb,
    timeout_milliseconds := 60000
  );
END;
$$;

SELECT cron.schedule('crawl-daily-digest', '0 1 * * *', 'SELECT public.call_crawl_daily_digest()');
