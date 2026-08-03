-- PHƯƠNG ÁN ④ (03/08): công tắc chuyển cú VIẾT P3 sang DeepSeek V4-Flash.
-- Căn cứ bake-off 02-03/08 (50 bài đã đăng, chấm mù 1 người + máy đối chiếu):
--   văn 4.03 vs Haiku 3.91 · sai dữ kiện 1/33 vs 5/33 · $0.0018/bài (1/4.4 Haiku)
--   → cú viết ~$4.8-6/ngày dự kiến về ~$1.1-1.6/ngày.
-- Kiến trúc an toàn giữ nguyên: DeepSeek lỗi/timeout/parse fail → Haiku viết
-- thay ngay trong nhịp; giám khảo P1 (local + Haiku fallback) vẫn soi từng bài.
--
-- BẬT (sau khi đã set secret DEEPSEEK_API_KEY cho edge functions):
--   UPDATE hybrid_config SET enabled = true  WHERE key = 'viet_deepseek';
-- TẮT (quay về Haiku tức thì, không cần deploy):
--   UPDATE hybrid_config SET enabled = false WHERE key = 'viet_deepseek';

INSERT INTO public.hybrid_config (key, enabled)
VALUES ('viet_deepseek', false)
ON CONFLICT (key) DO NOTHING;
