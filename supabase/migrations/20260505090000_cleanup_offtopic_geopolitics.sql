-- Cleanup batch 2: 13 bài tangential lọt qua keyword filter (đa phần geopolitics
-- Iran/Triều Tiên/quân sự hạt nhân + du lịch điện gió + digest mix). Tất cả từ
-- 3 nguồn đã disable (Tuổi Trẻ PR #32, VOV + Báo Quốc Tế PR #34) nên không
-- re-crawl được nữa — chỉ historical cleanup.
--
-- LLM `relevant: false` (PR #34) sẽ catch case này về sau ngay khi crawl mới.
--
-- KHÔNG xoá 3 bài borderline:
--   2678d3b5 — VN tọa đàm hòa bình năng lượng hạt nhân (peaceful nuclear, relevant)
--   bc520e24 + 95742c3a — Sun Group + Keppel năng lượng cho hệ sinh thái du lịch
--                          (DN năng lượng — borderline, để user quyết).

DELETE FROM public.electricity_news WHERE id IN (
  '37e3b08a-9fbd-4b40-aa12-0b5e34ca52e2', -- Tuổi Trẻ: Săn cá chèm điện gió Hòa Bình 1 (du lịch)
  'db28cae6-2e52-4431-a8f3-72141174be52', -- VOV: Iran bảo vệ năng lực hạt nhân + tên lửa (military)
  '84699e80-fabd-43a7-aa66-afbe8a27e19e', -- VOV: Trump gây sức ép Iran hạt nhân (geopolitics)
  'c5e8a535-df23-4db8-8de8-2ab08b056d09', -- Báo QT: Nga kêu gọi không vũ khí hạt nhân (military)
  '6cdff0d0-8fc2-4147-96f3-692d8bd74288', -- Báo QT: Giá nông sản + cà phê + vận tải (digest mix)
  '37152aaa-fb8a-4062-ae94-60982381e395', -- Báo QT: Pháp tăng vũ khí hạt nhân, Nga đáp trả (military)
  'e616ac65-80a9-4c53-b631-a85ab2f8e2ae', -- Báo QT: IAEA NPT vũ khí hạt nhân (military)
  '5f5726f2-517d-4c57-b02b-b639adffae2f', -- VOV: VN Chủ tịch hiệp ước không phổ biến vũ khí hạt nhân (military diplomacy)
  '57b4368e-2dbf-416b-be11-67797b3d0c58', -- Tuổi Trẻ: Chiến sự Iran giúp TQ thắng lớn năng lượng (geopolitics)
  '39b22506-85c3-4176-9230-1079f7ab0b57', -- VOV: Iran tách Hormuz khỏi thỏa thuận hạt nhân (geopolitics)
  '922defcc-2323-4bc2-afff-500114078501', -- Tuổi Trẻ: Iran đề xuất hoãn đàm phán hạt nhân (geopolitics)
  '8a268c58-9934-4811-a977-4b10c6a4d6a6'  -- Báo QT: Nga cắt giảm kho vũ khí hạt nhân (military)
);
