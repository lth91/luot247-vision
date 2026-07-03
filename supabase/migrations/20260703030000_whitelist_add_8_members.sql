-- Thêm 8 nhân viên mới (STT 25-32 danh sách 03/07) vào whitelist gửi tin.
-- Idempotent (ON CONFLICT DO NOTHING).

INSERT INTO public.submission_whitelist (email, full_name) VALUES
  ('vu.hoang.minh.anh.denco@gmail.com',       'Vũ Hoàng Minh Anh'),
  ('nguyen.thanh.thao.denco@gmail.com',       'Nguyễn Thanh Thảo'),
  ('luong.huyen.mai.denco@gmail.com',         'Lương Huyền Mai'),
  ('nguyen.chuc.denco@gmail.com',             'Nguyễn Phương Chúc'),
  ('nguyen.ngoc.phuong.linh.denco@gmail.com', 'Nguyễn Ngọc Phương Linh'),
  ('nguyen.h.trang.denco@gmail.com',          'Nguyễn Thị Huyền Trang'),
  ('vu.thai.duong.denco@gmail.com',           'Vũ Thái Dương'),
  ('doan.tran.minh.phuc.denco@gmail.com',     'Đoàn Trần Minh Phúc')
ON CONFLICT (email) DO NOTHING;
