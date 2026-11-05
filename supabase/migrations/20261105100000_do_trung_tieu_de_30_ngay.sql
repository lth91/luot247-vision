-- 05/11: DB quá tải giờ làm việc (200–500 truy vấn/giờ bị cắt ở 8s) → bảng
-- Thống kê (/bang-xep-hang) báo "Chưa có dữ liệu" vì get_submission_dashboard
-- bị cắt theo.
--
-- Thủ phạm: find_similar_news_title (submit-news, submit-news-bulk gọi cho
-- TỪNG tin, crawl-news cũng gọi) dò trigram trên TOÀN BỘ bảng news ~800.000
-- dòng, mỗi lần ~2,5–6s.
--
-- Sửa (anh Long chốt 30 ngày): chỉ dò trùng với tin trong 30 ngày gần nhất,
-- qua bảng phụ news_recent_titles (~280.000 dòng) có GIN trigram riêng.
-- Đo cùng một tiêu đề mới lúc DB đang tải: 6,3s → 2,6s. Tin gửi lại giống
-- tin cũ hơn 30 ngày sẽ không bị chặn nữa.
--   - Trigger trên news giữ bảng phụ cập nhật khi thêm/sửa tiêu đề.
--   - Cron 19:40 UTC hằng ngày dọn dòng quá 30 ngày.
--   - XOÁ news → dòng bảng phụ tự xoá theo (FK ON DELETE CASCADE).
--
-- (Đã thử GiST KNN trước đó: nhanh khi trùng nhưng tin mới chậm 8–10s, và
--  planner chọn nhầm GiST cho toán tử % — đã gỡ, không để lại gì.)
--
-- Đã chạy trực tiếp 05/11.

CREATE TABLE IF NOT EXISTS public.news_recent_titles (
  news_id uuid PRIMARY KEY REFERENCES public.news(id) ON DELETE CASCADE,
  title_normalized text NOT NULL,
  created_at timestamptz NOT NULL
);
ALTER TABLE public.news_recent_titles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.news_recent_titles FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS idx_news_recent_titles_created ON public.news_recent_titles (created_at);
CREATE INDEX IF NOT EXISTS idx_news_recent_titles_trgm
  ON public.news_recent_titles USING gin (title_normalized extensions.gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.news_sync_recent_title()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.title_normalized IS NULL OR NEW.created_at <= now() - interval '30 days' THEN
    DELETE FROM public.news_recent_titles WHERE news_id = NEW.id;
    RETURN NULL;
  END IF;
  INSERT INTO public.news_recent_titles (news_id, title_normalized, created_at)
  VALUES (NEW.id, NEW.title_normalized, NEW.created_at)
  ON CONFLICT (news_id) DO UPDATE
    SET title_normalized = EXCLUDED.title_normalized, created_at = EXCLUDED.created_at;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_news_sync_recent_title ON public.news;
CREATE TRIGGER trg_news_sync_recent_title
  AFTER INSERT OR UPDATE OF title, title_normalized ON public.news
  FOR EACH ROW EXECUTE FUNCTION public.news_sync_recent_title();

-- Nạp lại sau khi có trigger (bắt tin chen vào giữa lúc nạp lần đầu).
INSERT INTO public.news_recent_titles (news_id, title_normalized, created_at)
SELECT id, title_normalized, created_at FROM public.news
 WHERE created_at > now() - interval '30 days' AND title_normalized IS NOT NULL
ON CONFLICT (news_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.find_similar_news_title(_title text, _threshold real DEFAULT 0.7)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_norm text;
  v_id uuid;
BEGIN
  v_norm := public.normalize_title_for_similarity(_title);
  -- Title quá ngắn hay false-positive nhiều → bỏ qua dedup title.
  IF v_norm IS NULL OR length(v_norm) < 20 THEN
    RETURN NULL;
  END IF;

  PERFORM set_limit(_threshold);

  -- Chỉ dò trong 30 ngày gần nhất (bảng phụ news_recent_titles).
  SELECT news_id INTO v_id
  FROM public.news_recent_titles
  WHERE title_normalized % v_norm
    AND extensions.similarity(title_normalized, v_norm) >= _threshold
  ORDER BY extensions.similarity(title_normalized, v_norm) DESC
  LIMIT 1;

  RETURN v_id;
END;
$function$;

SELECT cron.schedule('news-recent-titles-purge', '40 19 * * *',
  $$DELETE FROM public.news_recent_titles WHERE created_at < now() - interval '30 days'$$);
