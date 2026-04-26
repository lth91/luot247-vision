-- Xoá bài digest Tuổi Trẻ trộn 2 chủ đề (lương hưu + giá điện)
-- Pattern: title có dấu ";" nối 2 topic không liên quan, summary trộn cả 2.
-- Classifier mới đã thêm reject rule cho digest/multi-topic.

DELETE FROM public.electricity_news
WHERE id = 'df7a050d-411e-45d7-bfbf-49568c971b78';
