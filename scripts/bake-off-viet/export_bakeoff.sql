-- BỘ ĐỀ BAKE-OFF CÚ VIẾT P3 (01/08)
-- Lấy ~70 bài gần nhất đã qua giám khảo ĐẠT: mỗi hàng có sẵn bài gốc
-- (đúng bản 4000 ký tự production dùng) + bản Haiku đã viết (baseline miễn phí).
-- Chạy trong SQL Editor → copy ô kết quả (JSON) → lưu thành bo_de.json:
--   pbpaste > ~/Desktop/LocalLLM/bake-off/bo_de.json
--
-- Lưu ý: hàng giam_khao_live bị cron purge dọn hằng ngày lúc 19:50 UTC —
-- chạy query này trong ngày, đừng để qua hôm sau.

SELECT json_agg(t) FROM (
  SELECT id,
         payload->>'orig_title'   AS orig_title,
         payload->>'orig_content' AS orig_content,
         payload->>'pub_date'     AS pub_date,
         payload->>'news_title'   AS haiku_title,
         payload->>'news_content' AS haiku_content
    FROM llm_shadow_queue
   WHERE task = 'giam_khao_live'
     AND status = 'finalized'
     AND local_verdict->>'verdict' = 'dat'          -- chỉ bài đã được duyệt đăng
     AND length(payload->>'orig_content') >= 800    -- đủ dữ kiện để viết
   ORDER BY created_at DESC
   LIMIT 70
) t;

-- Nếu kết quả < 50 bài (queue vừa bị purge), nới điều kiện verdict:
-- bỏ dòng "AND local_verdict->>'verdict' = 'dat'" rồi chạy lại.
