-- Phase 2 — Source tier system: phân biệt nguồn uy tín ở UI và sort theo tier.
-- Tier 1: official (EVN family, ministries, industry association) — tin chính thức
-- Tier 2: specialized media/companies (Báo Công Thương Điện, PECC, plant-specific)
-- Tier 3: general news with electricity coverage (VOV, Tuổi Trẻ, VnExpress) — default
-- Tier 4: aggregator (RSS Discovery) — diluted quality

-- 1. Cột tier trên electricity_sources
ALTER TABLE public.electricity_sources
  ADD COLUMN IF NOT EXISTS tier smallint NOT NULL DEFAULT 3
    CHECK (tier BETWEEN 1 AND 4);

COMMENT ON COLUMN public.electricity_sources.tier IS
  '1=official, 2=specialized, 3=general news (default), 4=aggregator';

-- 2. Backfill tier dựa trên hiểu biết về từng source (audit 03/05/2026)
UPDATE public.electricity_sources SET tier = CASE
  -- Tier 1: utilities, government, industry association.
  -- Mac Mini Scraper là virtual source — articles thực tế từ icon.com.vn
  -- (EVN affiliate magazine), evnhcmc.vn, dienvadoisong.vn — đều là nguồn chính thức.
  WHEN name IN (
    'EVN', 'Bộ Công Thương', 'Hiệp hội NL Việt Nam', 'Mac Mini Scraper',
    'Cục Điện lực', 'Công đoàn Điện lực', 'EVN Hà Nội', 'EVN HCM',
    'EVN miền Bắc (NPC)', 'EVN miền Trung (CPC)', 'EVNGENCO2',
    'Trung tâm dịch vụ sửa chữa EVN'
  ) THEN 1
  -- Tier 2: specialized electricity media + power engineering/plant companies.
  WHEN name IN (
    'Báo Công Thương - Điện', 'Báo Công Thương - NLTT',
    'Báo Đấu Thầu', 'Năng lượng sạch VN', 'Điện và Đời sống',
    'Xây Lắp Điện', 'PECC1', 'PECC3', 'Nhiệt điện Ninh Bình',
    'Tài chính EVN', 'CTCP ĐT PT điện miền Trung', 'ICON'
  ) THEN 2
  -- Tier 4: aggregator across many general news sources.
  WHEN name = 'RSS Discovery' THEN 4
  -- Tier 3: everything else (general bao-chi, doanh-nghiep general)
  ELSE 3
END;

-- 3. Snapshot tier xuống electricity_news (denormalized).
-- Lý do: frontend chỉ select từ electricity_news (RLS đơn giản), tránh JOIN mỗi query.
-- Stale-ness chấp nhận: nếu đổi tier source sau, news cũ giữ tier cũ. Edit thủ công nếu cần.
ALTER TABLE public.electricity_news
  ADD COLUMN IF NOT EXISTS tier smallint;

UPDATE public.electricity_news n
SET tier = s.tier
FROM public.electricity_sources s
WHERE n.source_id = s.id AND n.tier IS NULL;

-- 4. Trigger BEFORE INSERT: copy tier từ source.
-- Edge functions (crawl, discovery) không cần biết về tier — trigger handle.
CREATE OR REPLACE FUNCTION public.electricity_news_set_tier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.tier IS NULL THEN
    SELECT tier INTO NEW.tier
    FROM public.electricity_sources
    WHERE id = NEW.source_id;
    IF NEW.tier IS NULL THEN
      NEW.tier := 3;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_electricity_news_set_tier ON public.electricity_news;
CREATE TRIGGER trg_electricity_news_set_tier
  BEFORE INSERT ON public.electricity_news
  FOR EACH ROW
  EXECUTE FUNCTION public.electricity_news_set_tier();

-- 5. Index để sort tier ASC, published_at DESC trên frontend nhanh
CREATE INDEX IF NOT EXISTS idx_electricity_news_tier_published
  ON public.electricity_news (tier ASC, published_at DESC NULLS LAST);
