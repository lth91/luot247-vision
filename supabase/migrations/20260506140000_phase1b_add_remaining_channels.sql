-- Phase 1B — Catch 3 bài Category A còn lại từ QA round 24 bài.
--
-- Probe channel (commit ad6b366) đã catch bài #5 #8 #16 #24 (cycle tiếp theo).
-- Phase 1B xử lý 3 bài còn lại:
--   #2 nangluongvietnam giải pháp cung ứng điện EVN — channel
--      /nhan-dinh-phan-bien-kien-nghi (vị trí #3 trên page)
--   #17 cafef Lào Vân Nam điện — breadcrumb confirm channel
--      /tai-chinh-quoc-te.chn (International Finance)
--   #9 baotintuc.vn — old /index.rss đã 0 articles 14 ngày → auto-disable.
--      Probe / xác nhận URL đúng là /tin-moi-nhat.rss + /the-gioi.rss + ...
--      Reactivate với URL /tin-moi-nhat.rss (broader, để keyword filter +
--      LLM classifier xử lý), hủy marker manual disable.

INSERT INTO electricity_sources (
  name, base_url, list_url, feed_type,
  list_link_pattern, article_content_selector,
  category, tier, is_active, pending_review, consecutive_failures
) VALUES
  (
    'Hiệp hội NL Việt Nam - Nhận định',
    'https://nangluongvietnam.vn',
    'https://nangluongvietnam.vn/nhan-dinh-phan-bien-kien-nghi',
    'html_list',
    '/.+-\d+\.html',
    'div.article-content, article.fck_detail, div.detail-content',
    'doanh-nghiep', 1, true, false, 0
  ),
  (
    'Cafef - Tài chính quốc tế',
    'https://cafef.vn',
    'https://cafef.vn/tai-chinh-quoc-te.chn',
    'html_list',
    '/.+-\d+\.chn',
    'div.detail-content, div.contentdetail',
    'bao-chi', 3, true, false, 0
  );

-- Reactivate baotintuc với URL RSS đúng (cũ /index.rss thực tế không tồn tại
-- → 0 articles 14d → auto-disabled). RSS chính thức ở /tin-moi-nhat.rss.
UPDATE electricity_sources
SET list_url = 'https://baotintuc.vn/tin-moi-nhat.rss',
    is_active = true,
    consecutive_failures = 0,
    last_error = 'manual reactivate 2026-05-06: URL /index.rss sai (404), đổi sang /tin-moi-nhat.rss (xác nhận RSS 2.0 valid). Marker manual để cron auto-reenable không lật.'
WHERE name = 'baotintuc.vn';
