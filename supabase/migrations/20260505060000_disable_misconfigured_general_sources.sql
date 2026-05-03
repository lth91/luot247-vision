-- Disable 3 nguồn cấu hình sai: list_url trỏ vào trang chủ RSS / homepage HTML
-- (không phải sectional điện), khiến crawl-electricity-news bơm tin off-topic
-- (BĐS, tai nạn, lifestyle, cung hoàng đạo) vào electricity_news.
--
-- Audit 03/05/2026 sau screenshot user: tab /d ngập tin không liên quan từ 3 nguồn
-- này. Per-source crawler không có topical filter (chỉ discovery-rss-news có).
--
-- RSS Discovery đã cover sectional feeds cho VOV (vov.vn/rss/kinh-te.rss). NLD và
-- Báo Quốc Tế không có sectional điện chuẩn → bỏ hẳn, để Phase E auto-discovery
-- thay thế nếu cần.
--
-- Cleanup tin off-topic đã insert hôm nay từ 3 nguồn này (chỉ xoá những title
-- KHÔNG match keyword điện, để giữ lại bài đúng chủ đề lỡ lọt vào).

UPDATE public.electricity_sources
SET is_active = false,
    last_error = 'manual disable 2026-05-03: list_url là trang chủ tổng hợp (không sectional điện), crawler không có topical filter nên bơm tin off-topic. RSS Discovery cover sectional nếu có.'
WHERE list_url IN (
  'https://nld.com.vn/rss/home.rss',
  'https://vov.vn',
  'https://baoquocte.vn'
);

DELETE FROM public.electricity_news
WHERE crawled_at >= '2026-05-03 00:00:00+07'
  AND source_id IN (
    SELECT id FROM public.electricity_sources
    WHERE list_url IN ('https://nld.com.vn/rss/home.rss', 'https://vov.vn', 'https://baoquocte.vn')
  )
  AND title !~* '(EVN|BESS|điện|năng\s*lượng|điện\s*lực|điện\s*gió|điện\s*mặt\s*trời|thủy\s*điện|nhiệt\s*điện|lưới\s*điện|cung\s*ứng\s*điện|giá\s*điện|tiết\s*kiệm\s*điện|hydro|NLTT|PPA|DPPA|Quy\s*hoạch\s*điện|Bộ\s*Công\s*Thương|Cục\s*Điện\s*lực)';
