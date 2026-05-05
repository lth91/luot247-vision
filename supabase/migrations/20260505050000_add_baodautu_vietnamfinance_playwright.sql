-- Manual add 2 nguồn báo JS-rendered qua Mac Mini Playwright handover.
--
-- Yêu cầu user 5/5: nhân viên tay tìm 16 bài, 2 trong đó (#5, #12) từ
-- baodautu.vn và vietnamfinance.vn — site JS-rendered, RSS không tồn tại,
-- không thể crawl bằng edge function. Mac Mini Playwright handle được vì
-- render JS đầy đủ.
--
-- URL pattern observe từ user list:
--   baodautu.vn:        /<slug>-d<id>.html  (vd /dien-bien-trai-chieu-...-d577731.html)
--   vietnamfinance.vn:  /<slug>-d<id>.html  (vd /hang-tram-ty-usd-...-d144021.html)
-- Cùng schema → cùng pattern.
--
-- pending_review=true: 24h test window theo Phase E lifecycle. Cron
-- pending-playwright-lifecycle (migration 20260506050000) sẽ flip
-- is_active=true nếu có articles, hoặc disable nếu 0 article sau 24h.
--
-- content_selector NULL → extractor.py fallback main/article/p concat.

INSERT INTO public.electricity_sources (
  name, base_url, list_url, feed_type, list_link_pattern,
  category, tier, is_active, pending_review, scraper_config
)
SELECT * FROM (VALUES
  (
    'Mac Mini (baodautu.vn)',
    'https://baodautu.vn',
    'https://baodautu.vn/',
    'playwright',
    NULL::text,
    'bao-chi',
    3,
    false,
    true,
    jsonb_build_object(
      'list_url', 'https://baodautu.vn/',
      'link_pattern', '^/[a-z0-9-]{20,}-d\d+\.html$',
      'content_selector', NULL,
      'category', 'bao-chi'
    )
  ),
  (
    'Mac Mini (vietnamfinance.vn)',
    'https://vietnamfinance.vn',
    'https://vietnamfinance.vn/',
    'playwright',
    NULL::text,
    'bao-chi',
    3,
    false,
    true,
    jsonb_build_object(
      'list_url', 'https://vietnamfinance.vn/',
      'link_pattern', '^/[a-z0-9-]{20,}-d\d+\.html$',
      'content_selector', NULL,
      'category', 'bao-chi'
    )
  )
) AS t(name, base_url, list_url, feed_type, list_link_pattern, category, tier, is_active, pending_review, scraper_config)
WHERE NOT EXISTS (
  SELECT 1 FROM public.electricity_sources s WHERE s.name = t.name
);
