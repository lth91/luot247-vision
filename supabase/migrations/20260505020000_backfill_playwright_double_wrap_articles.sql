-- Backfill 23 articles bị insert SAI source_id sau khi Phase E Playwright
-- handover hoạt động lần đầu (cron 8:20 VN ngày 2026-05-05).
--
-- Bug: extractor.py:265 luôn wrap source_name = f"Mac Mini ({source.name})".
-- DB-driven Playwright sources có source.name = "Mac Mini (host)" rồi → wrap
-- thêm thành "Mac Mini (Mac Mini (host))". Lookup src_id_by_name fail →
-- fallback virtual "Mac Mini Scraper" id → 23 bài attach sai.
--
-- Đã fix code trong luot247-scraper commit 16df0f6 (chỉ wrap nếu chưa bắt
-- đầu "Mac Mini "). Migration này dọn dẹp 23 bài đã lỡ insert sai:
--   • Unwrap source_name: "Mac Mini (Mac Mini (X))" → "Mac Mini (X)"
--   • Re-attach source_id theo tên đã unwrap

WITH article_fixes AS (
  SELECT
    n.id,
    REGEXP_REPLACE(n.source_name, '^Mac Mini \(Mac Mini \(([^)]+)\)\)$', 'Mac Mini (\1)') AS new_source_name
  FROM public.electricity_news n
  WHERE n.source_name LIKE 'Mac Mini (Mac Mini %'
),
mapped AS (
  SELECT
    a.id,
    a.new_source_name,
    s.id AS new_source_id,
    s.category AS new_source_category
  FROM article_fixes a
  JOIN public.electricity_sources s ON s.name = a.new_source_name
)
UPDATE public.electricity_news n
SET source_id = m.new_source_id,
    source_name = m.new_source_name,
    source_category = m.new_source_category
FROM mapped m
WHERE n.id = m.id;
