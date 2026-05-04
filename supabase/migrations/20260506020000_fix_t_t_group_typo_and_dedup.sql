-- Fix typo "T&amp;T" trong title bài vietnamnet do RSS feed double-encode entity
-- (CMS encode 2 lần: "T&amp;amp;T" → single-pass decode chỉ ra "T&amp;T").
-- Pipeline `discovery-rss-news/index.ts` đã được vá để loop decode tới khi stable.
--
-- Đồng thời mark 2 bài RSS Discovery (vietnamnet + cafef) là duplicate của bài
-- Mac Mini scrape qdnd.vn cùng sự kiện "T&T Group nhà máy điện gió Savan 1 Lào".
-- Trigram dedup function không bắt được vì 3 title paraphrase mạnh
-- (similarity 0.49 và 0.21, dưới ngưỡng 0.7) — cần semantic dedup (LLM) tương lai.
-- Winner = qdnd.vn (tier 1 chính thức) vs RSS Discovery (tier 4 báo tổng hợp).

UPDATE public.electricity_news
SET title = replace(title, '&amp;', '&')
WHERE id = 'dc3fe970-b835-4d5d-bcba-af6a772cbb35';

UPDATE public.electricity_news
SET is_duplicate_of = 'f2e2d63b-6a49-4c62-95f6-6b9cf265b0f9'
WHERE id IN (
  'dc3fe970-b835-4d5d-bcba-af6a772cbb35',
  '782675e6-def7-442a-ba42-53c97e665596'
);
