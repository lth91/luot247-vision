-- Dân Trí đã redesign sang layout dùng Tailwind + data-slot attributes.
-- Selector cũ (div.singular-content, article.singular, div.detail-content) không còn match.
-- Layout hiện tại:
--   <div data-slot="content" id="desktop-in-article">  ← body bài viết
--   <div data-slot="sapo">                              ← lead
--   <div data-slot="title">                             ← tiêu đề
-- Dùng id #desktop-in-article (selector chính) + fallback attribute selector.

UPDATE public.electricity_sources
SET article_content_selector = '#desktop-in-article, div[data-slot="content"]',
    consecutive_failures = 0,
    last_error = NULL
WHERE name = 'Dân Trí - EVN'
