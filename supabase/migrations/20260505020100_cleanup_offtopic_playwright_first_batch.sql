-- Cleanup 23 articles off-topic insert lần đầu sau Phase E Playwright
-- handover hoạt động (cron 8:20 VN ngày 5/5).
--
-- Bug: Mac Mini Playwright scraper KHÔNG có topic filter — crawl homepage
-- của báo general (znews.vn, plo.vn, petrotimes.vn, nguoiquansat.vn,
-- thuonghieucongluan.com.vn) → match link_pattern → fetch + summarize MỌI
-- bài (Du lịch, BĐS, Bóng đá Premier League, Trump-Iran, Vàng SJC, ...).
--
-- 23/23 bài đầu tiên đều OFF-TOPIC theo electricity-keywords filter.
-- Code fix đã push trong luot247-scraper commit 01aad2f (topic_filter.py
-- + extractor.py): chỉ apply filter cho DB-driven Playwright sources
-- (source.name bắt đầu "Mac Mini ").
--
-- Migration này dọn 23 bài đã lỡ insert. Các cycle sau topic filter sẽ
-- chặn tại extractor — không cần migration cleanup tái diễn.

DELETE FROM public.electricity_news
WHERE id::text = ANY (ARRAY[
  'de5a89ac-625d-405c-907c-2f92e330c7ac',
  '9a9fc4f1-a850-4b1b-aa9b-221e44175361',
  'ebc7bdcb-bf67-442e-aa1e-83b4250c4301',
  'adbec24a-962f-4791-bc4a-0d3e3518d978',
  '7b10d1b9-b9ae-4b81-898e-47bd5d3e45bd',
  '96fd30c7-ec30-4fc3-8a43-b4e78921957a',
  '2e78daca-c965-456f-ae30-1bece1f16db9',
  '79ac0860-28fa-4596-8338-3789c49abcd0',
  '4356a85e-7466-466f-87cd-5d692248c2b1',
  'a24919b7-14c1-49b4-8cbb-04c8b88a85d6',
  'a6821a5f-ffd8-4481-bb8f-ecc29082acdc',
  'e99ff320-6c34-4fd5-8c68-ab7e5b42f575',
  '5cbe5106-800c-435a-8527-fc825820bebe',
  'a334bdba-370f-4770-8e7e-971a1f63d539',
  'edadab59-a327-4be7-8077-ab1d0d13032d',
  '1204b93f-7066-425f-8b6e-c3a339e2c299',
  '82e36410-04b2-4d39-a22e-49fc15f5f5a6',
  'cc49bfab-0c91-47b7-acc0-514c15d76115',
  '0af36c2c-fba6-49ee-89ae-eeb8cfa70518',
  'c0cdb865-d592-4e40-a70a-afc7d75292f9',
  'f5942020-0eea-4687-8759-9700cf6f7404',
  '1dd340fa-b3cb-45b4-8ea3-86c14d11ab78',
  '7de201c4-28e7-4bda-a3c3-638b08f1dbd3'
]);
