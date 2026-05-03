-- Cleanup 3 bài lọt qua keyword filter vì title có "điện gió"/"hạt nhân" nhưng
-- chủ đề chính off-topic (du lịch, địa chính trị, du lịch đen).
--
-- Audit 03/05/2026 từ user screenshot. Các bài này crawled trước khi fix triple-
-- layer guard (PR cùng ngày) deploy, hoặc từ nguồn đã disable trước đó (Tuổi
-- Trẻ - PR #32). Code mới với LLM `relevant: false` sẽ catch case này về sau.

DELETE FROM public.electricity_news WHERE id IN (
  '1575ece4-a74c-471d-8c44-c369b8caba3c', -- Tuổi Trẻ: Du khách sa lầy check-in điện gió Quảng Trị
  '45d765e1-b5f4-4467-a712-f5a435af72bc', -- VOV: Du lịch đen sau thảm họa hạt nhân
  'e9eda46b-e782-41c9-9548-a3518de49d5a'  -- Báo Quốc Tế: Triều Tiên hạt nhân vs Mỹ sa lầy Trung Đông
);
