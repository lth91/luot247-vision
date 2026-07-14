-- PR4 pipeline AI crawl: cron tự động + bảo trì hàng đợi + giám sát.
--
-- Nhịp GIAI ĐOẠN 0-1: crawl MỖI GIỜ (mỗi run quét 15 nguồn cũ nhất, trần 35
-- call LLM ≈ $4-5/ngày, ~600-800 tin/ngày vào hàng đợi). Khi chất lượng ổn +
-- PR5 (giới hạn feed trang chủ) đã lên, tăng tốc GĐ1 full bằng 1 câu:
--   SELECT cron.schedule('crawl-news-tick', '*/15 * * * *', 'SELECT public.call_crawl_news()');
-- (cron.schedule cùng jobname sẽ ghi đè lịch cũ.)

-- ===== 1) Gọi edge crawl-news (pattern vault chuẩn của repo) =====
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
    timeout_milliseconds := 150000
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.call_crawl_health_check()
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
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
END;
$$;

-- ===== 2) Bảo trì hàng đợi (chạy trong DB, không cần edge) =====
-- • Tin pending quá 3 ngày: hết giá trị thời sự → tự chuyển 'rejected'
--   (không xoá — url_hash tiếp tục chặn crawler re-insert).
-- • Tin rejected quá 30 ngày: xoá hẳn (feed nguồn đã trôi xa, không sợ re-crawl;
--   trigger block_hard_delete chỉ chặn tin có submitted_by nên tin AI xoá được).
-- • Nguồn bị auto-disable (>=10 fail liên tiếp): bật lại sau 24h cho thử vận
--   mới. Nguồn TẮT TAY (consecutive_failures < 10, vd URL sai) KHÔNG bị đụng.
CREATE OR REPLACE FUNCTION public.maintain_review_queue()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.news SET
    review_status = 'rejected',
    reviewed_at = now()
  WHERE review_status = 'pending'
    AND submitted_by IS NULL
    AND created_at < now() - INTERVAL '3 days';

  DELETE FROM public.news
  WHERE review_status = 'rejected'
    AND submitted_by IS NULL
    AND COALESCE(reviewed_at, created_at) < now() - INTERVAL '30 days';

  UPDATE public.crawl_sources SET
    is_active = true,
    consecutive_failures = 0,
    last_error = 'auto re-enable sau 24h cooldown'
  WHERE is_active = false
    AND consecutive_failures >= 10
    AND last_crawled_at < now() - INTERVAL '24 hours';
END;
$$;

-- ===== 3) Lịch cron =====
SELECT cron.schedule('crawl-news-tick', '5 * * * *', 'SELECT public.call_crawl_news()');
SELECT cron.schedule('crawl-health-check-6h', '35 */6 * * *', 'SELECT public.call_crawl_health_check()');
SELECT cron.schedule('crawl-queue-maintenance', '0 18 * * *', 'SELECT public.maintain_review_queue()'); -- 1h sáng VN
