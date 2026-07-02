-- Khoá tính năng GỬI TIN cho mọi user — chỉ email trong danh sách đăng ký
-- (nhân viên Denco) hoặc admin mới được gửi. Chốt chặn THẬT nằm ở edge
-- submit-news / submit-news-bulk (query bảng này); frontend chỉ ẩn UI.
-- Bảng chỉ admin đọc/sửa (thêm/bớt email qua Supabase dashboard hoặc SQL);
-- user thường kiểm tra quyền của CHÍNH MÌNH qua RPC is_submission_allowed()
-- (SECURITY DEFINER — không lộ danh sách email cho người ngoài).

CREATE TABLE IF NOT EXISTS public.submission_whitelist (
  email text PRIMARY KEY,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.submission_whitelist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage submission whitelist" ON public.submission_whitelist;
CREATE POLICY "Admins manage submission whitelist"
  ON public.submission_whitelist
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- true nếu email đăng nhập hiện tại nằm trong whitelist HOẶC là admin.
CREATE OR REPLACE FUNCTION public.is_submission_allowed()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.submission_whitelist w
    WHERE w.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  ) OR public.has_role(auth.uid(), 'admin');
$$;

REVOKE ALL ON FUNCTION public.is_submission_allowed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_submission_allowed() TO authenticated;

-- Danh sách đăng ký email gửi tin (email lưu lowercase).
INSERT INTO public.submission_whitelist (email, full_name) VALUES
  ('long@denco.vn',                        'Nguyễn Thành Long'),
  ('nguyen.long.denco@gmail.com',          'Nguyễn Thành Long'),
  ('le.oanh.denco@gmail.com',              'Lê Thị Oanh'),
  ('do.manh.denco@gmail.com',              'Đỗ Khỏe Mạnh'),
  ('nguyen.binh.denco@gmail.com',          'Nguyễn Thị Bình'),
  ('trinh.nga.denco@gmail.com',            'Trịnh Ánh Ngà'),
  ('dang.van.denco@gmail.com',             'Đặng Thị Thúy Vân'),
  ('nguyen.nga.denco@gmail.com',           'Nguyễn Thị Nga'),
  ('nguyen.thi.huong.denco@gmail.com',     'Nguyễn Thị Hương'),
  ('pham.thuy.denco@gmail.com',            'Phạm Ngọc Thuỷ'),
  ('nguyen.thi.hong.denco@gmail.com',      'Nguyễn Thị Hồng'),
  ('phung.hien.denco@gmail.com',           'Phùng Thu Hiền'),
  ('xuyen@denco.vn',                       'Nguyễn Thị Kim Xuyến'),
  ('nguyen.thao.nguyen.denco@gmail.com',   'Nguyễn Thảo Nguyên'),
  ('tran.minh.denco@gmail.com',            'Trần Lê Ngọc Minh'),
  ('bui.na.denco@gmail.com',               'Bùi Thị Na'),
  ('tran.minh.hang.denco@gmail.com',       'Trần Thị Minh Hằng'),
  ('tran.bao.ngoc.denco@gmail.com',        'Trần Bảo Ngọc'),
  ('bui.mai.linh.denco@gmail.com',         'Bùi Mai Linh'),
  ('pham.phuong.dung.denco@gmail.com',     'Phạm Thị Dung'),
  ('nguyen.kieu.tuan.denco@gmail.com',     'Nguyễn Kiều Tuân'),
  ('nguyen.trungthanh.denco@gmail.com',    'Nguyễn Trung Thành'),
  ('thai.ha.denco@gmail.com',              'Thái Thị Thanh Hà'),
  ('luong.phuong.diep.denco@gmail.com',    'Lương Phương Diệp'),
  ('luong.thi.thao.denco@gmail.com',       'Lương Thị Thảo')
ON CONFLICT (email) DO NOTHING;
