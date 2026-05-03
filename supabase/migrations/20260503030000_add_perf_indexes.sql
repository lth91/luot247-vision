-- Cover unindexed FKs (advisor 0001) and add ordered indexes for the /d page hot reads.

CREATE INDEX IF NOT EXISTS idx_electricity_news_source_id
  ON public.electricity_news (source_id);

CREATE INDEX IF NOT EXISTS idx_electricity_news_crawled_at_desc
  ON public.electricity_news (crawled_at DESC);

CREATE INDEX IF NOT EXISTS idx_electricity_news_published_at_desc
  ON public.electricity_news (published_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_classification_history_news_id
  ON public.classification_history (news_id);

CREATE INDEX IF NOT EXISTS idx_favorites_news_id
  ON public.favorites (news_id);
