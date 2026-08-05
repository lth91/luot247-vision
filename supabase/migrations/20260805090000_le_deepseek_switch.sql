-- PHƯƠNG ÁN ④ ĐỢT CHÓT (05/08): tin GỬI LẺ (submit-news) chấm bằng DeepSeek
-- sau công tắc le_deepseek — mảnh Haiku thường trực cuối cùng (~$0.8/ngày).
-- Fallback Haiku giữ nguyên khi DeepSeek lỗi/parse fail.
-- BẬT:  UPDATE hybrid_config SET enabled = true  WHERE key = 'le_deepseek';
-- LÙI:  UPDATE hybrid_config SET enabled = false WHERE key = 'le_deepseek';

INSERT INTO public.hybrid_config (key, enabled)
VALUES ('le_deepseek', false)
ON CONFLICT (key) DO NOTHING;
