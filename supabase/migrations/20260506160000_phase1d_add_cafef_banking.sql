-- Phase 1D — Add Cafef Tài chính - Ngân hàng channel cho bài finance-energy.
--
-- QA round trước (16 bài) có #16 Cafef ADB Việt Nam — bài tại
-- /tai-chinh-ngan-hang.chn về ADB hỗ trợ vốn năng lượng. Phase 1B đã add
-- /tai-chinh-quoc-te.chn (catch #17 Lào Vân Nam điện), giờ add tiếp
-- /tai-chinh-ngan-hang.chn — banking-energy crossover (PPA financing,
-- ADB/IBRD loans, green credit).

INSERT INTO electricity_sources (
  name, base_url, list_url, feed_type,
  list_link_pattern, article_content_selector,
  category, tier, is_active, pending_review, consecutive_failures
) VALUES (
  'Cafef - Tài chính ngân hàng',
  'https://cafef.vn',
  'https://cafef.vn/tai-chinh-ngan-hang.chn',
  'html_list',
  '/.+-\d+\.chn',
  'div.detail-content, div.contentdetail',
  'bao-chi', 3, true, false, 0
);
