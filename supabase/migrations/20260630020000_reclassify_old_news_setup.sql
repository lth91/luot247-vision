-- Phân loại lại tin cũ (do user gửi) theo taxonomy 6 mục (gồm Khoa học - Công
-- nghệ). Hạ tầng: sửa trigger updated_at + RPC lấy lô + RPC tự huỷ cron + cron
-- gọi edge function reclassify-news mỗi 2 phút (tự huỷ khi xong).

-- 1) Trigger updated_at của NEWS: chỉ bump khi nội dung (title/description/
--    is_approved) đổi. Trước đây dùng chung update_updated_at_column (bump MỌI
--    update) → reclassify đổi category sẽ xáo thứ tự feed. Tách hàm riêng cho
--    news để không ảnh hưởng bảng khác.
CREATE OR REPLACE FUNCTION public.news_bump_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.title IS DISTINCT FROM OLD.title
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.is_approved IS DISTINCT FROM OLD.is_approved THEN
    NEW.updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_news_updated_at ON public.news;
CREATE TRIGGER update_news_updated_at
  BEFORE UPDATE ON public.news
  FOR EACH ROW EXECUTE FUNCTION public.news_bump_updated_at();

-- 2) Lấy lô tin cần phân loại lại (tin user gửi, chưa gắn cờ rc='2').
CREATE OR REPLACE FUNCTION public.get_news_to_reclassify(_limit int)
RETURNS TABLE(id uuid, title text, description text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, title, COALESCE(description, '')
  FROM public.news
  WHERE submitted_by IS NOT NULL
    AND COALESCE(ai_classification->>'rc', '') <> '2'
  ORDER BY created_at
  LIMIT _limit;
$$;

-- 3) Tự huỷ cron khi đã phân loại xong (edge function gọi khi hết tin).
CREATE OR REPLACE FUNCTION public.stop_reclassify_cron()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
BEGIN
  PERFORM cron.unschedule('reclassify-news');
EXCEPTION WHEN OTHERS THEN
  NULL; -- chưa lên lịch / đã huỷ → bỏ qua
END;
$$;

-- 4) Wrapper gọi edge function reclassify-news (service key từ vault).
CREATE OR REPLACE FUNCTION public.call_reclassify_news()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';
  EXCEPTION WHEN OTHERS THEN
    v_key := NULL;
  END;
  PERFORM net.http_post(
    url := 'https://gklpvaindbfkcmuuuffz.supabase.co/functions/v1/reclassify-news',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(v_key, ''),
      'apikey', COALESCE(v_key, '')
    ),
    body := '{}'::jsonb
  );
END;
$$;

-- 5) Lên lịch chạy mỗi 2 phút. Tự huỷ qua stop_reclassify_cron() khi xong.
DO $$
BEGIN
  PERFORM cron.unschedule('reclassify-news');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

SELECT cron.schedule('reclassify-news', '*/2 * * * *', $$SELECT public.call_reclassify_news();$$);
