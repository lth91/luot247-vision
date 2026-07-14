-- PR1 pipeline AI crawl tin tổng hợp (kế hoạch 13/07):
--   1) Bảng crawl_sources — nguồn RSS/HTML báo lớn VN (clone khung electricity_sources,
--      KHÔNG trộn bảng cũ để giữ nguyên dữ liệu pipeline điện đang ngủ).
--   2) Cột hàng đợi duyệt trên news: review_status/reviewed_by/reviewed_at.
--      Tin AI crawl: is_approved=false + review_status='pending' (KHÔNG lên trang
--      cho tới khi nhân viên duyệt). Tin gửi tay giữ review_status=NULL — không
--      ảnh hưởng luồng cũ. Tin bị LOẠI giữ nguyên row (url_hash chặn re-crawl).
--   3) Seed 38 feed. Feed chưa verify được từ máy dev (proxy chặn) — sau deploy
--      chạy mode check_sources của edge crawl-news để verify từ egress Supabase;
--      feed hỏng sẽ tự disable sau 10 lần fail liên tiếp.

-- ===== 1) Bảng nguồn =====
CREATE TABLE IF NOT EXISTS public.crawl_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  base_url text NOT NULL,
  list_url text NOT NULL UNIQUE,
  feed_type text NOT NULL DEFAULT 'rss' CHECK (feed_type IN ('rss', 'html_list')),
  list_link_pattern text,
  article_content_selector text,
  default_category public.news_category NOT NULL DEFAULT 'xa-hoi-van-hoa',
  tier smallint NOT NULL DEFAULT 2 CHECK (tier BETWEEN 1 AND 3),
  is_active boolean NOT NULL DEFAULT true,
  consecutive_failures int NOT NULL DEFAULT 0,
  last_crawled_at timestamptz,
  last_error text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crawl_sources ENABLE ROW LEVEL SECURITY;
-- Đọc: user đăng nhập (trang duyệt hiển thị tên nguồn; không có gì nhạy cảm).
-- Ghi: chỉ service role (edge function) — không mở policy INSERT/UPDATE/DELETE.
CREATE POLICY "Authenticated read crawl sources" ON public.crawl_sources
  FOR SELECT TO authenticated USING (true);

-- ===== 2) Cột hàng đợi duyệt trên news =====
ALTER TABLE public.news ADD COLUMN IF NOT EXISTS review_status text
  CHECK (review_status IN ('pending', 'approved', 'rejected'));
ALTER TABLE public.news ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.news ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_news_review_pending
  ON public.news (created_at DESC) WHERE review_status = 'pending';

-- ===== 3) Seed nguồn =====
-- tier 1 = feed lớn cập nhật dày; 2 = báo lớn; 3 = chuyên trang/chưa chắc URL.
-- default_category chỉ là fallback khi LLM trả slug không hợp lệ.
INSERT INTO public.crawl_sources (name, base_url, list_url, feed_type, article_content_selector, default_category, tier) VALUES
  -- VnExpress (tier 1)
  ('VnExpress Kinh doanh',  'https://vnexpress.net', 'https://vnexpress.net/rss/kinh-doanh.rss', 'rss', 'article.fck_detail', 'kinh-te-dau-tu',       1),
  ('VnExpress Thời sự',     'https://vnexpress.net', 'https://vnexpress.net/rss/thoi-su.rss',    'rss', 'article.fck_detail', 'xa-hoi-van-hoa',       1),
  ('VnExpress Thế giới',    'https://vnexpress.net', 'https://vnexpress.net/rss/the-gioi.rss',   'rss', 'article.fck_detail', 'the-gioi',             1),
  ('VnExpress Pháp luật',   'https://vnexpress.net', 'https://vnexpress.net/rss/phap-luat.rss',  'rss', 'article.fck_detail', 'an-ninh-trat-tu',      1),
  ('VnExpress Thể thao',    'https://vnexpress.net', 'https://vnexpress.net/rss/the-thao.rss',   'rss', 'article.fck_detail', 'the-thao',             1),
  ('VnExpress Số hóa',      'https://vnexpress.net', 'https://vnexpress.net/rss/so-hoa.rss',     'rss', 'article.fck_detail', 'khoa-hoc-cong-nghe',   1),
  ('VnExpress Khoa học',    'https://vnexpress.net', 'https://vnexpress.net/rss/khoa-hoc.rss',   'rss', 'article.fck_detail', 'khoa-hoc-cong-nghe',   1),
  ('VnExpress Giải trí',    'https://vnexpress.net', 'https://vnexpress.net/rss/giai-tri.rss',   'rss', 'article.fck_detail', 'xa-hoi-van-hoa',       1),
  ('VnExpress Giáo dục',    'https://vnexpress.net', 'https://vnexpress.net/rss/giao-duc.rss',   'rss', 'article.fck_detail', 'xa-hoi-van-hoa',       1),
  ('VnExpress Sức khỏe',    'https://vnexpress.net', 'https://vnexpress.net/rss/suc-khoe.rss',   'rss', 'article.fck_detail', 'xa-hoi-van-hoa',       1),
  -- Dân Trí (tier 2)
  ('Dân Trí Kinh doanh',    'https://dantri.com.vn', 'https://dantri.com.vn/rss/kinh-doanh.rss',   'rss', 'div.singular-content', 'kinh-te-dau-tu',     2),
  ('Dân Trí Xã hội',        'https://dantri.com.vn', 'https://dantri.com.vn/rss/xa-hoi.rss',       'rss', 'div.singular-content', 'xa-hoi-van-hoa',     2),
  ('Dân Trí Thế giới',      'https://dantri.com.vn', 'https://dantri.com.vn/rss/the-gioi.rss',     'rss', 'div.singular-content', 'the-gioi',           2),
  ('Dân Trí Pháp luật',     'https://dantri.com.vn', 'https://dantri.com.vn/rss/phap-luat.rss',    'rss', 'div.singular-content', 'an-ninh-trat-tu',    2),
  ('Dân Trí Thể thao',      'https://dantri.com.vn', 'https://dantri.com.vn/rss/the-thao.rss',     'rss', 'div.singular-content', 'the-thao',           2),
  ('Dân Trí Sức mạnh số',   'https://dantri.com.vn', 'https://dantri.com.vn/rss/suc-manh-so.rss',  'rss', 'div.singular-content', 'khoa-hoc-cong-nghe', 2),
  -- Tuổi Trẻ (tier 2)
  ('Tuổi Trẻ Thời sự',      'https://tuoitre.vn', 'https://tuoitre.vn/rss/thoi-su.rss',      'rss', 'div.detail-content', 'xa-hoi-van-hoa',    2),
  ('Tuổi Trẻ Kinh doanh',   'https://tuoitre.vn', 'https://tuoitre.vn/rss/kinh-doanh.rss',   'rss', 'div.detail-content', 'kinh-te-dau-tu',    2),
  ('Tuổi Trẻ Pháp luật',    'https://tuoitre.vn', 'https://tuoitre.vn/rss/phap-luat.rss',    'rss', 'div.detail-content', 'an-ninh-trat-tu',   2),
  ('Tuổi Trẻ Thế giới',     'https://tuoitre.vn', 'https://tuoitre.vn/rss/the-gioi.rss',     'rss', 'div.detail-content', 'the-gioi',          2),
  ('Tuổi Trẻ Thể thao',     'https://tuoitre.vn', 'https://tuoitre.vn/rss/the-thao.rss',     'rss', 'div.detail-content', 'the-thao',          2),
  -- Thanh Niên (tier 2)
  ('Thanh Niên Thời sự',    'https://thanhnien.vn', 'https://thanhnien.vn/rss/thoi-su.rss',  'rss', 'div.detail-content', 'xa-hoi-van-hoa',    2),
  ('Thanh Niên Kinh tế',    'https://thanhnien.vn', 'https://thanhnien.vn/rss/kinh-te.rss',  'rss', 'div.detail-content', 'kinh-te-dau-tu',    2),
  ('Thanh Niên Thế giới',   'https://thanhnien.vn', 'https://thanhnien.vn/rss/the-gioi.rss', 'rss', 'div.detail-content', 'the-gioi',          2),
  ('Thanh Niên Thể thao',   'https://thanhnien.vn', 'https://thanhnien.vn/rss/the-thao.rss', 'rss', 'div.detail-content', 'the-thao',          2),
  -- VietnamNet (tier 2)
  ('VietnamNet Thời sự',    'https://vietnamnet.vn', 'https://vietnamnet.vn/rss/thoi-su.rss',     'rss', 'div.maincontent', 'xa-hoi-van-hoa',  2),
  ('VietnamNet Kinh doanh', 'https://vietnamnet.vn', 'https://vietnamnet.vn/rss/kinh-doanh.rss',  'rss', 'div.maincontent', 'kinh-te-dau-tu',  2),
  -- CafeF (tier 2 — kinh tế/chứng khoán chuyên sâu)
  ('CafeF Chứng khoán',     'https://cafef.vn', 'https://cafef.vn/thi-truong-chung-khoan.rss',  'rss', 'div.detail-content', 'chung-khoan',    2),
  ('CafeF Doanh nghiệp',    'https://cafef.vn', 'https://cafef.vn/doanh-nghiep.rss',            'rss', 'div.detail-content', 'kinh-te-dau-tu', 2),
  ('CafeF Tài chính NH',    'https://cafef.vn', 'https://cafef.vn/tai-chinh-ngan-hang.rss',     'rss', 'div.detail-content', 'kinh-te-dau-tu', 2),
  ('CafeF Bất động sản',    'https://cafef.vn', 'https://cafef.vn/bat-dong-san.rss',            'rss', 'div.detail-content', 'kinh-te-dau-tu', 2),
  -- Nhóm tier 3 (URL RSS chưa chắc — chờ check_sources xác nhận)
  ('Lao Động Thời sự',      'https://laodong.vn',     'https://laodong.vn/rss/thoi-su.rss',            'rss', 'div.art-body',            'xa-hoi-van-hoa',       3),
  ('Lao Động Kinh doanh',   'https://laodong.vn',     'https://laodong.vn/rss/kinh-doanh.rss',         'rss', 'div.art-body',            'kinh-te-dau-tu',       3),
  ('VnEconomy Chứng khoán', 'https://vneconomy.vn',   'https://vneconomy.vn/chung-khoan.rss',          'rss', 'div.detail__content',     'chung-khoan',          3),
  ('NLĐ Pháp luật',         'https://nld.com.vn',     'https://nld.com.vn/rss/phap-luat.rss',          'rss', 'div.detail-content',      'an-ninh-trat-tu',      3),
  ('CAND Pháp luật',        'https://cand.com.vn',    'https://cand.com.vn/rss/phap-luat/',            'rss', 'div.detail-content-body', 'an-ninh-trat-tu',      3),
  ('Tiền Phong Kinh tế',    'https://tienphong.vn',   'https://tienphong.vn/rss/kinh-te-3.rss',        'rss', 'div.article__body',       'kinh-te-dau-tu',       3),
  ('Báo Chính Phủ',         'https://baochinhphu.vn', 'https://baochinhphu.vn/chinh-sach-moi.rss',     'rss', 'div.detail-content',      'chinh-sach-phap-luat', 3)
ON CONFLICT (list_url) DO NOTHING;
