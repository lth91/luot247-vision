-- NGHỈ HƯU MACBOOK (03/08): 2 công tắc chuyển nốt giám khảo P1 + chấm lô bulk
-- sang DeepSeek V4-Flash. Chi phí thêm ~$0.3-0.5/ngày (~ tiền điện MacBook 24/7),
-- đổi lại: máy tự do, tin lên nhanh hơn (bỏ trễ 5-15' hàng đợi), UX lô tức thì.
-- Fallback Haiku giữ nguyên ở MỌI lớp; hạ tầng local (worker/queue/finalize)
-- để nguyên ở chế độ ngủ — bật lại làm plan B bất cứ lúc nào.
--
-- TRÌNH TỰ BẬT (đợi ít nhất 1 bản tin sáng xác nhận viet_deepseek ổn):
--   1. UPDATE hybrid_config SET enabled = true  WHERE key = 'giam_khao_deepseek';
--      (thắng crawl_giam_khao — job local mới không sinh thêm; job cũ trong
--       queue vẫn được worker/finalize xử nốt)
--   2. Theo dõi 1 ngày: tỷ lệ giám khảo loại không đột biến trong bản tin sáng.
--   3. UPDATE hybrid_config SET enabled = true  WHERE key = 'bulk_deepseek';
--      (thắng bulk_local — nhân viên gửi lô có kết quả NGAY như trước hybrid)
--   4. Queue trống (SELECT count(*) FROM llm_shadow_queue WHERE status IN
--      ('pending','processing') AND task IN ('giam_khao_live','phan_loai_lo');
--      = 0) → tắt worker trên MacBook. Xong.
-- LÙI: SET enabled = false công tắc tương ứng → về đúng kiến trúc cũ tức thì.

INSERT INTO public.hybrid_config (key, enabled)
VALUES ('giam_khao_deepseek', false), ('bulk_deepseek', false)
ON CONFLICT (key) DO NOTHING;
