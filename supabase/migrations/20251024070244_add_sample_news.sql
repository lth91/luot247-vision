-- Add sample news data
INSERT INTO public.news (title, description, category, url, view_count, created_at, updated_at) VALUES
('Tin tức công nghệ mới nhất', 'Công nghệ AI đang phát triển mạnh mẽ với nhiều ứng dụng thực tế', 'cong-nghe', 'https://example.com/tech-news', 0, now(), now()),
('Thể thao: Kết quả bóng đá hôm nay', 'Trận đấu giữa hai đội bóng hàng đầu đã kết thúc với tỷ số hòa', 'the-thao', 'https://example.com/sports-news', 0, now(), now()),
('Kinh tế: Thị trường chứng khoán', 'Thị trường chứng khoán có những biến động tích cực trong tuần này', 'kinh-te', 'https://example.com/economy-news', 0, now(), now()),
('Chính trị: Tin tức trong nước', 'Các hoạt động chính trị quan trọng diễn ra trong tuần', 'chinh-tri', 'https://example.com/politics-news', 0, now(), now()),
('Xã hội: Vấn đề giáo dục', 'Ngành giáo dục có những cải tiến mới trong phương pháp giảng dạy', 'xa-hoi', 'https://example.com/society-news', 0, now(), now()),
('Giải trí: Phim ảnh mới', 'Những bộ phim mới được công chiếu thu hút đông đảo khán giả', 'giai-tri', 'https://example.com/entertainment-news', 0, now(), now()),
('Tin tức tổng hợp', 'Những tin tức nổi bật trong ngày từ các lĩnh vực khác nhau', 'khac', 'https://example.com/general-news', 0, now(), now()),
('Công nghệ: Phát triển ứng dụng', 'Các ứng dụng di động mới được phát triển với tính năng hiện đại', 'cong-nghe', 'https://example.com/app-development', 0, now(), now()),
('Thể thao: Olympic 2024', 'Các vận động viên Việt Nam chuẩn bị cho Olympic 2024', 'the-thao', 'https://example.com/olympic-2024', 0, now(), now()),
('Kinh tế: Xuất khẩu tăng trưởng', 'Kim ngạch xuất khẩu của Việt Nam tăng trưởng mạnh', 'kinh-te', 'https://example.com/export-growth', 0, now(), now());
