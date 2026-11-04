-- 04/11: view hôm qua (03/11) chỉ 391. Cron auto-views-every-30min gọi
-- daily-auto-views bằng service_role JWT kiểu cũ dán cứng trong lệnh cron;
-- từ ~7h30 sáng 03/11 gateway bắt đầu trả 401 "Legacy API keys are disabled"
-- (key cũ đã tắt từ 27/04 nhưng tới giờ mới bị chặn) → không bơm view nữa.
-- Các cron khác (crawl-news…) lấy key từ Vault nên vẫn chạy.
--
-- Sửa: hàm call_daily_auto_views() đọc vault 'service_role_key' giống
-- call_crawl_news(), và trỏ cron sang hàm này (cron.schedule cùng tên = cập nhật).

CREATE OR REPLACE FUNCTION public.call_daily_auto_views()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_key text;
BEGIN
  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  PERFORM net.http_post(
    url := 'https://gklpvaindbfkcmuuuffz.supabase.co/functions/v1/daily-auto-views',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(v_key, ''),
      'apikey', COALESCE(v_key, '')
    ),
    body := '{}'::jsonb
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.call_daily_auto_views() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('auto-views-every-30min', '*/30 * * * *', 'SELECT public.call_daily_auto_views()');
