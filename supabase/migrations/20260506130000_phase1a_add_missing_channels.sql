-- Phase 1A — Catch 6 bài Category A bằng cách bổ sung channel còn thiếu.
--
-- Tổng kết QA round 2 (24 bài nhân viên gửi 5/5):
--   - 5/24 hit qua source hiện có
--   - Trong 17 bài miss, có 6 bài "Category A" — domain ĐÃ có source nhưng bài
--     nằm trên channel khác source không scan.
--
-- Probe channel xác nhận:
--   1. congthuong.vn/nang-luong (parent channel) chứa #8 & #24 — source hiện
--      tại chỉ scan /dien (con) và /nang-luong/nang-luong-tai-tao (cháu).
--   2. nangluongvietnam.vn/dien-luc-viet-nam chứa #5 ở vị trí #1 — source
--      hiện tại scan root homepage (chỉ MAX 6 bài đầu).
--   3. vneconomy.vn/khoa-hoc.rss valid RSS — chưa có trong Discovery FEEDS.
--      Bài #16 "NLTT vs DAC" thuộc khoa học/môi trường.

INSERT INTO electricity_sources (
  name, base_url, list_url, feed_type,
  list_link_pattern, article_content_selector,
  category, tier, is_active, pending_review, consecutive_failures
) VALUES
  (
    'Báo Công Thương - Năng lượng',
    'https://congthuong.vn',
    'https://congthuong.vn/nang-luong',
    'html_list',
    '/.+-\d+\.html',
    'div.article-content, article.fck_detail, div.detail-content',
    'bao-chi', 2, true, false, 0
  ),
  (
    'Hiệp hội NL Việt Nam - Điện lực',
    'https://nangluongvietnam.vn',
    'https://nangluongvietnam.vn/dien-luc-viet-nam',
    'html_list',
    '/.+-\d+\.html',
    'div.article-content, article.fck_detail, div.detail-content',
    'doanh-nghiep', 1, true, false, 0
  );
