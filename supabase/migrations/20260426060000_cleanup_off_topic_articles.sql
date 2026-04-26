-- Audit thủ công 127 bài DB ngày 26/04/2026, xoá 22 bài off-topic không liên quan ngành điện VN.
-- Lý do từng bài ghi trong comment.

DELETE FROM public.electricity_news WHERE id IN (
  'bfbc3862-a6a4-4f49-a847-dfea246ac798', -- [6] Chuyện cái khôn nhặt nhạnh — folktale, không nhắc điện
  '3c45d4c7-e999-419e-9108-1dbdbd4f25df', -- [9] Chernobyl 40 năm — du lịch/lịch sử thảm họa
  '4cac09a6-51b2-47cf-9595-adda54f526da', -- [12] Xăng E10 — nhiên liệu sinh học cho giao thông, không phải điện
  '480f24f4-b5a3-4881-ad3d-a50b928d0ca1', -- [16] EU trừng phạt thứ 20 Moscow năng lượng — địa chính trị
  '2498e6f0-5362-4a5e-8836-e74a0c416dbb', -- [18] Tin công nghệ Meta/messenger — aggregator chung
  '62ff2d16-b1a0-44f2-8d41-495a5a49177b', -- [19] Chiến lược tự chủ năng lượng EU — macro EU
  '3d070514-5c87-468b-b1a2-45450d358111', -- [31] Nhật mở kho dự trữ dầu — dầu, nước ngoài
  'a88ff6a2-083b-43f2-9594-3bb462d5f65e', -- [38] Trump giận vũ khí hạt nhân Iran — vũ khí hạt nhân
  'e05d2fec-ac4e-4d56-8e33-15f8318b5445', -- [39] Nga cảnh báo Pháp vũ khí hạt nhân — vũ khí hạt nhân
  '477bd233-89dd-41af-9be2-cbbc0cf278c4', -- [40] LHQ ủng hộ VN NPT — ngoại giao hiệp ước hạt nhân
  'cc79527c-dd12-4b55-b82f-1a0e30c72e03', -- [52] 73 MOU VN-KR — quá tổng quát, năng lượng chỉ 1 trong nhiều
  '7b4db14a-8675-45d1-b8d2-88010a2d66dd', -- [53] Trump bác hạt nhân Iran — địa chính trị
  '72d591ff-d676-415d-b830-44dac587115e', -- [55] Trung Đông Iran-Israel — địa chính trị
  '3576f3dd-34f8-4a67-80d7-48344893a587', -- [64] Tesla 800.000km — lifestyle tiêu dùng
  '6853daa1-85ee-4594-86e4-390ca0f2311c', -- [66] Hormuz Malacca — địa chính trị eo biển
  'b7ca1006-8dda-474d-9158-8eb03acecdb7', -- [68] IEA Hormuz khủng hoảng — địa chính trị
  '26e4e3fb-f09b-4658-ac46-eda3432fdc26', -- [82] EU thủy điện vs dầu mỏ — foreign + framing dầu
  'ce724d4b-071c-4bea-a8c0-912b4c5596ee', -- [88] NSRP tiết kiệm năng lượng — nhà máy lọc dầu, không phải điện
  'c68c1ef0-1c2e-4eec-be22-bd450f089eb1', -- [105] EU hạ nhiệt giá năng lượng — macro EU
  '9f5bc84b-4e67-4c01-8bdf-6565bba0fc74', -- [111] Iran "vũ khí ngày tận thế" Hormuz — địa chính trị
  '9138e717-439a-4e02-aa7c-2477c1ed05c9', -- [117] Doanh số xe điện Mỹ giảm 27% — thị trường tiêu dùng nước ngoài
  '293ee2dd-8575-48f0-804a-2e3f60e2cd26'  -- [118] EU cảnh báo khủng hoảng năng lượng — macro EU
);
