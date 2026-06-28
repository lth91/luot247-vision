-- 🔴 VÁ LỖ HỔNG: user tự sửa điểm của mình.
-- Policy cũ "Users can update own profile" FOR UPDATE USING (auth.uid()=id)
-- KHÔNG giới hạn cột + authenticated có grant UPDATE mặc định → bất kỳ user nào
-- cũng chạy được: supabase.from('profiles').update({ total_points: 9999999 }).
-- Khi điểm dùng để trả tiền (kể cả trả tay), điểm PHẢI không giả mạo được.
--
-- Đã kiểm: frontend KHÔNG có chỗ nào user update profiles → revoke an toàn.
-- Điểm chỉ được sửa qua trigger (SECURITY DEFINER) hoặc service_role.

REVOKE UPDATE ON public.profiles FROM anon, authenticated;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Nếu sau này cần cho user tự sửa display_name, mở lại CÓ GIỚI HẠN CỘT:
--   GRANT UPDATE (display_name) ON public.profiles TO authenticated;
--   CREATE POLICY "Users can update own display_name" ON public.profiles
--     FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
-- Tuyệt đối KHÔNG grant UPDATE các cột điểm cho authenticated/anon.
