-- Gỡ email nguyen.long.denco@gmail.com khỏi whitelist gửi tin (theo yêu cầu
-- 03/07 — chuyển về user thường). Anh Nguyễn Thành Long vẫn còn email
-- long@denco.vn trong danh sách. Idempotent.

DELETE FROM public.submission_whitelist
WHERE email = 'nguyen.long.denco@gmail.com';
