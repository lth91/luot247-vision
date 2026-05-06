-- Phase 1C — Add 3 domain mới (Category C) sau khi probe URL pattern.
--
-- QA round 24 bài, sau Phase 1B coverage projected 50%. Phase 1C target
-- thêm 3 bài (#14 nhadautu, #19 1thegioi, #21 baolaocai) → ~63%.
--
-- Defer: thoibaonganhang (RSS 403 từ test IP — có thể work từ edge),
-- tinnhanhchungkhoan (channel URL phức tạp), vietnam.vnanet (redirect HTTP).

INSERT INTO electricity_sources (
  name, base_url, list_url, feed_type,
  list_link_pattern, article_content_selector,
  category, tier, is_active, pending_review, consecutive_failures
) VALUES
  (
    'Nhà Đầu Tư - Sự kiện',
    'https://nhadautu.vn',
    'https://nhadautu.vn/su-kien/',
    'html_list',
    '/.+-d\d+\.html',
    'div.article-content, article.fck_detail, div.detail-content',
    'bao-chi', 3, true, false, 0
  ),
  (
    'Một Thế Giới - Kinh tế',
    'https://1thegioi.vn',
    'https://1thegioi.vn/kinh-te',
    'html_list',
    '/.+-\d+\.html',
    'div.article-content, article.fck_detail, div.detail-content',
    'bao-chi', 3, true, false, 0
  ),
  (
    'Báo Lào Cai - Kinh tế',
    'https://baolaocai.vn',
    'https://baolaocai.vn/kinh-te/',
    'html_list',
    '/.+-post\d+\.html',
    'div.article-content, article.fck_detail, div.detail-content',
    'bao-chi', 3, true, false, 0
  );
