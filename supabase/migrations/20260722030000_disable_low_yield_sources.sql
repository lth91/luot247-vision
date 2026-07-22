-- Tắt 5 nguồn kém hiệu quả (soi 7 ngày 15-22/07, anh Long chốt 22/07 — chỉ nhóm A).
-- Mặt bằng nguồn tốt: $0.02-0.04/tin được duyệt đăng. 5 nguồn này $0.057-0.085/tin
-- và nội dung yếu (showbiz/mẹo vặt/PR bị P3-P1 loại hàng loạt, hoặc gần như không
-- ra tin): VnExpress Giải trí (56 bài loại ngay khi viết), Sức khỏe (26 loại viết),
-- Số hóa (9 tin đăng/tuần), Báo Quốc tế (28 loại viết), Báo Chính Phủ (2 tin/7 ngày).
-- Tiết kiệm ~$0.49/ngày. Nhóm B (Dân Trí Thể thao, VietnamPlus, VnExpress Giáo dục)
-- GIỮ LẠI theo quyết định anh Long — trùng nhiều nhưng nội dung thật.
-- DML đã chạy tay trong SQL Editor 22/07; file này ghi lại cho lịch sử.

UPDATE public.crawl_sources SET is_active = false
 WHERE name IN ('VnExpress Giải trí', 'VnExpress Sức khỏe', 'VnExpress Số hóa',
                'Báo Quốc tế', 'Báo Chính Phủ');
