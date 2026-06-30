-- Bỏ tính năng phân loại lại tin cũ (không cần nữa — tin MỚI đã tự phân loại
-- đủ 6 mục gồm Khoa học - Công nghệ từ PR #73). Tắt cron + xoá các hàm phụ.
--
-- GIỮ LẠI: trigger news_bump_updated_at (chỉ bump updated_at khi nội dung đổi) —
-- đây là cải thiện độc lập, tránh xáo thứ tự feed khi cập nhật metadata.

DO $$
BEGIN
  PERFORM cron.unschedule('reclassify-news');
EXCEPTION WHEN OTHERS THEN
  NULL; -- chưa lên lịch / đã huỷ
END;
$$;

DROP FUNCTION IF EXISTS public.call_reclassify_news();
DROP FUNCTION IF EXISTS public.get_news_to_reclassify(int);
DROP FUNCTION IF EXISTS public.stop_reclassify_cron();
