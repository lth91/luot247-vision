-- Fix title bị lưu raw HTML entity do RSS parser cũ chỉ decode 6 entity XML chuẩn,
-- không decode named entities (oacute, aacute) và numeric refs (&#039;).
-- Edge function đã được vá; chỉ còn 1 bài tồn đọng trong DB cần update tay.

UPDATE public.electricity_news
SET title = 'Điện sinh hoạt có áp ''khung giờ cao điểm''?'
WHERE id = 'b9c3a6c0-eafd-4c51-a104-25f192df1d7f';
