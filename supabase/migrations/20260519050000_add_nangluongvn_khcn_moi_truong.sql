-- Coverage fix sau QA 19/5: bài #9 "quản trị thích ứng" (36052) miss dù
-- 4 sub-source nangluongvietnam.vn đều active. Root cause: bài thuộc chuyên
-- mục "Khoa học, công nghệ, môi trường" (/khoa-hoc-cong-nghe-moi-truong)
-- chưa có sub bao phủ. Listing verify có bài 36052 ở vị trí #1.
--
-- Pattern + selector dùng chung với 4 sub hiện có (đã chứng minh hoạt động).

INSERT INTO electricity_sources (
  name, base_url, list_url, feed_type, list_link_pattern,
  article_content_selector, category, is_active, tier
) VALUES (
  'Hiệp hội NL Việt Nam - KHCN Môi trường',
  'https://nangluongvietnam.vn',
  'https://nangluongvietnam.vn/khoa-hoc-cong-nghe-moi-truong',
  'html_list',
  '/.+-\d+\.html',
  'div.article-content, article.fck_detail, div.detail-content',
  'doanh-nghiep',
  true,
  1
);
