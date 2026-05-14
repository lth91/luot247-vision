-- Phase E handover 3 niche source — yield thấp (1-2 bài/tháng) nhưng
-- là channel duy nhất cho 1 số chủ đề:
--   - 1thegioi.vn: tin quốc tế ngành điện/data center (Singapore, etc.)
--     Trước đây disable do HTTP 403 anti-bot edge function → retry qua
--     Mac Mini Playwright (browser fingerprint thật)
--   - kienthuc.net.vn: tin quốc tế nhẹ (đảo năng lượng Bỉ, Meta điện
--     không gian, etc.). Yield niche nhưng thường UNIQUE — không có nguồn
--     khác cover các tin science-fiction kiểu này.
--   - vass.gov.vn: nghiên cứu academic (cơ chế carbon Ấn Độ, etc.).
--     Yield rất thấp (1-2 bài/quý) nhưng là tin nghiên cứu chính sách
--     không thể tìm chỗ khác.
--
-- Lifecycle 24h sẽ tự disable nếu không catch bài.

INSERT INTO electricity_sources (
  name, base_url, list_url, feed_type, list_link_pattern,
  article_content_selector, category, is_active, pending_review, tier,
  scraper_config, last_error
) VALUES
(
  'Mac Mini (1thegioi.vn)',
  'https://1thegioi.vn',
  'https://1thegioi.vn/',
  'playwright',
  '^/[a-z0-9-]+-\d+\.html$',
  null,
  'bao-chi',
  false,
  true,
  3,
  jsonb_build_object(
    'category', 'bao-chi',
    'list_url', 'https://1thegioi.vn/',
    'link_pattern', '^/[a-z0-9-]+-\d+\.html$',
    'content_selector', null,
    'wait_after_load_ms', 4000,
    'note', 'Trước đây HTTP 403 từ edge function — Mac Mini browser fingerprint thật bypass'
  ),
  'manual handover 2026-05-14: retry sau khi html_list bị 403. Bài #23 Singapore data center'
),
(
  'Mac Mini (kienthuc.net.vn)',
  'https://kienthuc.net.vn',
  'https://kienthuc.net.vn/',
  'playwright',
  '^/[a-z0-9-]+-post\d+\.html$',
  null,
  'bao-chi',
  false,
  true,
  3,
  jsonb_build_object(
    'category', 'bao-chi',
    'list_url', 'https://kienthuc.net.vn/',
    'link_pattern', '^/[a-z0-9-]+-post\d+\.html$',
    'content_selector', null,
    'wait_after_load_ms', 4000
  ),
  'manual handover 2026-05-14: bài #22 đảo năng lượng Bỉ. Yield niche ~1-2/tháng'
),
(
  'Mac Mini (vass.gov.vn)',
  'https://vass.gov.vn',
  'https://vass.gov.vn/bai-nghien-cuu-khxh',
  'playwright',
  '^/bai-nghien-cuu-[a-z]+/[a-z0-9-]+-\d+$',
  null,
  'co-quan',
  false,
  true,
  3,
  jsonb_build_object(
    'category', 'co-quan',
    'list_url', 'https://vass.gov.vn/bai-nghien-cuu-khxh',
    'link_pattern', '^/bai-nghien-cuu-[a-z]+/[a-z0-9-]+-\d+$',
    'content_selector', null,
    'wait_after_load_ms', 4000,
    'note', 'URL không có .html extension. Yield rất thấp ~1-2 bài/quý academic'
  ),
  'manual handover 2026-05-14: bài #19 carbon Ấn Độ. Academic content, yield thấp'
);
