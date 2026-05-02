-- Tách domain ra cột riêng cho electricity_news.
-- Trước: discovery-rss-news lưu source_name = "RSS Discovery (vneconomy.vn)" và
-- dashboard phải parse regex để gom — fragile và coupling chặt.
-- Sau: source_name = "RSS Discovery", source_domain = "vneconomy.vn".

ALTER TABLE public.electricity_news
  ADD COLUMN IF NOT EXISTS source_domain text;

-- Backfill: extract domain từ source_name dạng "RSS Discovery (xxx)" cho rows hiện có.
UPDATE public.electricity_news
SET source_domain = substring(source_name FROM '\(([^)]+)\)$')
WHERE source_name LIKE 'RSS Discovery (%)' AND source_domain IS NULL;

-- Sau backfill, normalize lại source_name về "RSS Discovery" (bỏ phần "(domain)").
UPDATE public.electricity_news
SET source_name = 'RSS Discovery'
WHERE source_name LIKE 'RSS Discovery (%)';

-- Index để dashboard group theo domain nhanh.
CREATE INDEX IF NOT EXISTS idx_elec_news_source_domain
  ON public.electricity_news (source_domain)
  WHERE source_domain IS NOT NULL;
