-- Coverage fix sau QA 5/16 (25 bài nhân viên gửi → catch 5/25 = 20%):
--
--   #10 nguoiquansat.vn/evn-thong-tin-tien-trien-moi-tai-du-an-dien-hat-nhan-...
--       → bài EVN Ninh Thuận hạt nhân. Source nguoiquansat đã disabled.
--       Bài cùng nội dung có trên EVN.com.vn chuyên mục "Đầu tư - Xây dựng"
--       (Dau-tu-Xay-dung-60-13): "Dự án Điện hạt nhân Ninh Thuận 1 tăng tốc
--       các bước chuẩn bị đầu tư" — top 2 listing. Add làm sub EVN tier 1.
--
--   #7  tapchilaoviet.com/.../dai-su-nguyen-minh-tam-de-nghi-thao-go-vuong-mac
--       → bài Đại sứ Tâm điện gió/thủy điện Việt Nam tại Lào. tapchilaoviet
--       có /feed/ RSS hợp lệ (5 item gần nhất chính trị Lào, có item điện gió
--       Trường Sơn 1-2 + thủy điện Xê Kaman). Tier 3 vì general Lào news.
--
-- 3 domain còn lại từ QA (doanhnghiepvadautu.info.vn, baoquangtri.vn,
-- pcgroup.vn) không có RSS → defer cho Mac Mini Playwright handover sau.

INSERT INTO electricity_sources (
  name, base_url, list_url, feed_type, list_link_pattern,
  article_content_selector, category, is_active, tier
) VALUES
(
  'EVN - Đầu tư Xây dựng',
  'https://www.evn.com.vn',
  'https://www.evn.com.vn/vi-VN/news-l/Dau-tu-Xay-dung-60-13',
  'html_list',
  '/d/vi-VN/news(?:-gallery)?/[^/]+-\d+-\d+-\d+',
  'div.news-detail, div.content-detail, article',
  'co-quan',
  true,
  1
),
(
  'Tạp chí Lào Việt',
  'https://tapchilaoviet.com',
  'https://tapchilaoviet.com/feed/',
  'rss',
  NULL,
  NULL,
  'bao-chi',
  true,
  3
);
