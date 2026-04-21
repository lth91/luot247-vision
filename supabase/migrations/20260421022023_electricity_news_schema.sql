-- Tin ngành điện Việt Nam: schema + seed 27 nguồn
-- Bảng electricity_sources lưu config crawl; electricity_news lưu tin đã tóm tắt.

CREATE TABLE public.electricity_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  base_url text NOT NULL,
  list_url text NOT NULL,
  feed_type text NOT NULL CHECK (feed_type IN ('rss','html_list')),
  list_link_pattern text,
  article_content_selector text,
  category text NOT NULL CHECK (category IN ('co-quan','doanh-nghiep','bao-chi')),
  is_active boolean NOT NULL DEFAULT true,
  consecutive_failures int NOT NULL DEFAULT 0,
  last_crawled_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.electricity_news (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid REFERENCES public.electricity_sources(id) ON DELETE SET NULL,
  source_name text NOT NULL,
  source_category text,
  title text NOT NULL,
  summary text NOT NULL,
  original_url text NOT NULL,
  url_hash text NOT NULL UNIQUE,
  published_at timestamptz,
  crawled_at timestamptz NOT NULL DEFAULT now(),
  summary_word_count int
);

CREATE INDEX idx_elec_news_published ON public.electricity_news (published_at DESC NULLS LAST, crawled_at DESC);
CREATE INDEX idx_elec_news_source ON public.electricity_news (source_name);
CREATE INDEX idx_elec_news_crawled ON public.electricity_news (crawled_at DESC);

ALTER TABLE public.electricity_news ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.electricity_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read electricity_news" ON public.electricity_news
  FOR SELECT USING (true);

CREATE POLICY "public read electricity_sources" ON public.electricity_sources
  FOR SELECT USING (true);

-- Seed 27 nguồn. list_link_pattern là regex so khớp href bài chi tiết trên trang list;
-- article_content_selector là CSS selector cho khối nội dung bài (edge function parse bằng deno-dom).

INSERT INTO public.electricity_sources (name, base_url, list_url, feed_type, list_link_pattern, article_content_selector, category) VALUES
-- Nhóm A: Cơ quan nhà nước & tập đoàn
('EVN',                    'https://www.evn.com.vn',    'https://www.evn.com.vn/vi-VN/news-l/Thong-tin-Su-kien-60-12', 'html_list', '/d6/news/.*\.aspx',                     'div.news-detail, div.content-detail, article', 'co-quan'),
('Cục Điện lực',           'https://eav.gov.vn',        'https://eav.gov.vn/vi-VN/news-l/Tin-tuc-Su-kien-60-5',        'html_list', '/vi-VN/news-d/.*',                       'div.news-detail, div.content-detail, article', 'co-quan'),
('Bộ Công Thương',         'https://minhbach.moit.gov.vn','https://minhbach.moit.gov.vn/nganh-dien',                   'html_list', '/nganh-dien/.*\.html',                   'div.article-content, article, div.content', 'co-quan'),
('EVNGENCO2',              'https://evngenco2.vn',      'https://evngenco2.vn/vi/news/tin-nganh-dien/',                'html_list', '/vi/news/tin-nganh-dien/.+\.html',       'div.article-content, article, div.content', 'co-quan'),
('EVN Hà Nội',             'https://evnhanoi.vn',       'https://evnhanoi.vn/cms/category?k=tin-chuyen-nganh',         'html_list', '/cms/[^?]+',                             'div.article-content, article, div.content', 'co-quan'),
('EVN HCM',                'https://www.evnhcmc.vn',    'https://www.evnhcmc.vn',                                      'html_list', '/tin-tuc/.*-\d+\.html',                  'div.detail, article, div.content', 'co-quan'),
('EVN miền Trung (CPC)',   'https://cpc.vn',            'https://cpc.vn/vi-vn/',                                       'html_list', '/vi-vn/Tin-tuc/.*',                      'div.news-detail, article, div.content', 'co-quan'),
('EVN miền Bắc (NPC)',     'https://npc.com.vn',        'https://npc.com.vn',                                          'html_list', '/View/tin-tuc/.*',                       'div.news-detail, article, div.content', 'co-quan'),
('Trung tâm dịch vụ sửa chữa EVN','https://evnpsc.com.vn','https://evnpsc.com.vn/vi-VN',                               'html_list', '/vi-VN/news-d/.*',                       'div.news-detail, article, div.content', 'co-quan'),
('Công đoàn Điện lực',     'https://www.congdoandlvn.org.vn','https://www.congdoandlvn.org.vn',                        'html_list', '/news/.*',                               'div.article-content, article, div.content', 'co-quan'),

-- Nhóm B: Doanh nghiệp & hiệp hội
('PECC1',                  'https://www.pecc1.com.vn',  'https://www.pecc1.com.vn',                                    'html_list', '/tin-tuc/.*',                            'div.article-content, article, div.content', 'doanh-nghiep'),
('PECC3',                  'https://www.pecc3.com.vn',  'https://www.pecc3.com.vn/tin-tuc/',                           'html_list', '/tin-tuc/.+',                            'div.article-content, article, div.content', 'doanh-nghiep'),
('Nhiệt điện Ninh Bình',   'https://nbtpc.com.vn',      'https://nbtpc.com.vn',                                        'html_list', '/tin-tuc/.*',                            'div.article-content, article, div.content', 'doanh-nghiep'),
('CTCP ĐT PT điện miền Trung','https://mientrungpid.com.vn','https://mientrungpid.com.vn/tin-tuc/tin-tuc-nganh-dien',  'html_list', '/tin-tuc/tin-tuc-nganh-dien/.+',         'div.article-content, article, div.content', 'doanh-nghiep'),
('Tài chính EVN',          'https://www.evnfc.vn',      'https://www.evnfc.vn',                                        'html_list', '/tin-tuc/.*',                            'div.article-content, article, div.content', 'doanh-nghiep'),
('Hiệp hội NL Việt Nam',   'https://nangluongvietnam.vn','https://nangluongvietnam.vn',                                'html_list', '/.+-\d+\.html',                          'div.article-content, article.fck_detail, div.detail-content', 'doanh-nghiep'),

-- Nhóm C: Báo chí / chuyên ngành
('Báo Công Thương - Điện', 'https://congthuong.vn',     'https://congthuong.vn/dien',                                  'html_list', '/.+-\d+\.html',                          'div.article-content, article.fck_detail, div.detail-content', 'bao-chi'),
('Báo Công Thương - NLTT', 'https://congthuong.vn',     'https://congthuong.vn/nang-luong/nang-luong-tai-tao',         'html_list', '/.+-\d+\.html',                          'div.article-content, article.fck_detail, div.detail-content', 'bao-chi'),
('ICON',                   'https://icon.com.vn',       'https://icon.com.vn',                                         'html_list', '/vn/.+',                                 'div.article-content, article, div.content', 'bao-chi'),
('Năng lượng sạch VN',     'https://nangluongsachvietnam.vn','https://nangluongsachvietnam.vn/vi-VN',                  'html_list', '/vi-VN/news-d/.*',                       'div.news-detail, article, div.content', 'bao-chi'),
('Điện và Đời sống',       'https://dienvadoisong.vn',  'https://dienvadoisong.vn',                                    'html_list', '/.+-\d+\.html',                          'div.article-content, article, div.content', 'bao-chi'),
('VnExpress - Ngành điện', 'https://vnexpress.net',     'https://vnexpress.net/chu-de/nganh-dien-6500',                'html_list', '/.+-\d+\.html',                          'article.fck_detail, .sidebar-1 article', 'bao-chi'),
('Cafef - Ngành điện',     'https://cafef.vn',          'https://cafef.vn/nganh-dien.html',                            'html_list', '/.+-\d+\.chn',                           'div.detail-content, div.contentdetail', 'bao-chi'),
('Thanh Niên - Ngành điện','https://thanhnien.vn',      'https://thanhnien.vn/nganh-dien-tags513085.html',             'html_list', '/.+-\d+\.html',                          'div.detail-content, article, div.content', 'bao-chi'),
('Dân Trí - EVN',          'https://dantri.com.vn',     'https://dantri.com.vn/chu-de/tap-doan-dien-luc-viet-nam-evn-4649.htm','html_list', '/.+-\d+\.htm',              'div.singular-content, article.singular, div.detail-content', 'bao-chi'),
('Người Lao Động',         'https://nld.com.vn',        'https://nld.com.vn/nganh-dien.html',                          'html_list', '/.+-\d+\.htm',                           'div.detail-content, article, div.content', 'bao-chi'),
('Xây Lắp Điện',           'https://xaylapdien.net',    'https://xaylapdien.net/tin-tuc-nganh-dien-moi-nhat',          'html_list', '/.+\.html',                              'div.article-content, article, div.content', 'bao-chi');
