-- MẤT DẤU (19/08): thỉnh thoảng bản viết ra tiếng Việt KHÔNG DẤU ("Ngay 18/8,
-- Carnival Nghe An 2026 dien ra tren tuyen duong Truong Thi"). Lưới chặn đã
-- vá trong crawl-news (đo tỉ lệ âm tiết có dấu → viết lại 1 lần bằng Haiku →
-- vẫn hỏng thì gắn needs_edit). File này dọn phần đã lọt vào bảng.
--
-- Nhận diện: bản tin tiếng Việt thật KHÔNG THỂ không có một chữ có dấu nào.
-- Chỉ soi tin đủ dài (>150 ký tự) để khỏi vướng tin tiêu đề toàn tên riêng.

-- (1) SOI TRƯỚC — xem dính bao nhiêu, nguồn nào, model nào viết:
--   SELECT n.created_at, n.is_approved, n.review_status,
--          n.ai_classification->>'source_name' AS nguon,
--          n.ai_classification->>'model'       AS model,
--          n.title
--     FROM public.news n
--    WHERE n.created_at > now() - interval '30 days'
--      AND length(n.description) > 150
--      AND n.description !~ '[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ]'
--    ORDER BY n.created_at DESC;

-- (2) TIN CÒN CHỜ DUYỆT → gắn nhãn để nhân viên buộc phải sửa trước khi duyệt.
UPDATE public.news
   SET ai_classification = coalesce(ai_classification, '{}'::jsonb)
                           || '{"needs_edit": true, "mat_dau": true}'::jsonb
 WHERE is_approved = false
   AND review_status = 'pending'
   AND created_at > now() - interval '30 days'
   AND length(description) > 150
   AND description !~ '[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ]';

-- (3) TIN ĐÃ ĐĂNG mà mất dấu → hạ xuống chờ sửa (bạn đọc đang nhìn thấy).
--     Chạy tay sau khi xem kết quả câu (1); bỏ comment nếu muốn hạ hàng loạt:
-- UPDATE public.news
--    SET is_approved = false, review_status = 'pending',
--        ai_classification = coalesce(ai_classification, '{}'::jsonb)
--                            || '{"needs_edit": true, "mat_dau": true}'::jsonb
--  WHERE is_approved = true
--    AND created_at > now() - interval '30 days'
--    AND length(description) > 150
--    AND description !~ '[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ]';
