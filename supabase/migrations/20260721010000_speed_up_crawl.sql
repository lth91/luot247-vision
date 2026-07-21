-- Nấc 1 + Nấc 2 tăng tốc quét (sếp duyệt 21/07, mục tiêu 1.000 tin chờ/ngày):
--   (1) Cron 30' → 15' (phút :05/:20/:35/:50).
--   (2) Ngân sách mỗi lượt 120s → 240s (edge function, PR cùng đợt) — kèm 2
--       điều kiện tiên quyết từ khảo sát rủi ro:
--       a) pg_net timeout 150s → 300s (không thì bị cắt kết nối giữa run);
--       b) claim nguồn ATOMIC (FOR UPDATE SKIP LOCKED) — khi pg_net dồn toa
--          bắn 2 request sát nhau, 2 run không lấy trùng nguồn nữa.

-- ===== a) Nâng timeout gọi edge function =====
CREATE OR REPLACE FUNCTION public.call_crawl_news()
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
    url := 'https://gklpvaindbfkcmuuuffz.supabase.co/functions/v1/crawl-news',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(v_key, ''),
      'apikey', COALESCE(v_key, '')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
END;
$$;

-- ===== b) Claim nguồn atomic: lấy N nguồn cũ nhất VÀ đóng dấu ngay =====
CREATE OR REPLACE FUNCTION public.claim_crawl_sources(_limit int DEFAULT 15)
RETURNS SETOF public.crawl_sources
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.crawl_sources c
  SET last_crawled_at = now()
  WHERE c.id IN (
    SELECT s.id FROM public.crawl_sources s
    WHERE s.is_active AND s.list_url LIKE 'http%'
    ORDER BY s.last_crawled_at ASC NULLS FIRST
    LIMIT _limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING c.*;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_crawl_sources(int) FROM anon, authenticated, public;

-- ===== Nấc 1: cron 15 phút (cùng tên job → ghi đè lịch 30' cũ) =====
SELECT cron.schedule('crawl-news-tick', '5,20,35,50 * * * *', 'SELECT public.call_crawl_news()');
