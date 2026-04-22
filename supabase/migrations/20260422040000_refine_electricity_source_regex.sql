-- Fix false-positive matches do regex "dien" quá lỏng (match cả diễn ra, diện rộng, lộ diện).
-- Dùng whitelist compound slugs chỉ khớp các cụm từ liên quan đến điện thực sự.
-- Bên cạnh đó fix URL Tuổi Trẻ (404), tạm disable The Leader (403).

-- Whitelist regex fragment: chỉ match khi URL chứa các cụm từ điện/năng lượng cụ thể
-- Ví dụ "dien-mat-troi" match nhưng "dien-ra" không.

-- Gom vào 1 CTE không khả thi vì SQL; viết trực tiếp các UPDATE.

-- Nhóm đuôi -post\d+.html (baodauthau, tinnhanhchungkhoan)
UPDATE public.electricity_sources
SET list_link_pattern = '/[^/]*(?:nganh-dien|dien-luc|dien-gio|dien-mat-troi|dien-hat-nhan|dien-khi|dien-than|dien-nang|dien-ap|dien-tai-tao|nhiet-dien|thuy-dien|xe-dien|nguon-dien|luoi-dien|gia-dien|tiet-kiem-dien|cung-ung-dien|nhu-cau-dien|phu-tai-dien|thi-truong-dien|duong-day-dien|may-phat-dien|cong-suat-dien|san-xuat-dien|luu-tru-dien|mat-dien|cat-dien|nang-luong|nltt|nlmt|evn[a-z]*|bess|pin-luu-tru|hat-nhan|tua-bin|dien-gio-ngoai-khoi)[^/]*-post\d+\.html'
WHERE name IN ('Báo Đấu Thầu', 'Tin Nhanh Chứng Khoán');

-- Nhóm đuôi -\d+.html
UPDATE public.electricity_sources
SET list_link_pattern = '/[^/]*(?:nganh-dien|dien-luc|dien-gio|dien-mat-troi|dien-hat-nhan|dien-khi|dien-than|dien-nang|dien-ap|dien-tai-tao|nhiet-dien|thuy-dien|xe-dien|nguon-dien|luoi-dien|gia-dien|tiet-kiem-dien|cung-ung-dien|nhu-cau-dien|phu-tai-dien|thi-truong-dien|duong-day-dien|may-phat-dien|cong-suat-dien|san-xuat-dien|luu-tru-dien|mat-dien|cat-dien|nang-luong|nltt|nlmt|evn[a-z]*|bess|pin-luu-tru|hat-nhan|tua-bin|dien-gio-ngoai-khoi)[^/]*-\d+\.html'
WHERE name IN ('Mekong Asean', 'Báo Quảng Ninh', 'Doanh nghiệp Hội nhập', 'Báo Quốc Tế');

-- Diễn đàn Doanh nghiệp: thêm luu-tru, pin
UPDATE public.electricity_sources
SET list_link_pattern = '/[^/]*(?:nganh-dien|dien-luc|dien-gio|dien-mat-troi|dien-hat-nhan|dien-khi|dien-than|dien-nang|dien-ap|dien-tai-tao|nhiet-dien|thuy-dien|xe-dien|nguon-dien|luoi-dien|gia-dien|tiet-kiem-dien|cung-ung-dien|nhu-cau-dien|phu-tai-dien|thi-truong-dien|duong-day-dien|may-phat-dien|cong-suat-dien|san-xuat-dien|luu-tru-dien|mat-dien|cat-dien|nang-luong|nltt|nlmt|evn[a-z]*|bess|pin-luu-tru|hat-nhan|tua-bin|dien-gio-ngoai-khoi|luu-tru|pin)[^/]*-\d+\.html'
WHERE name = 'Diễn đàn Doanh nghiệp';

-- Saigon Times: slug URL ends with /
UPDATE public.electricity_sources
SET list_link_pattern = '/[a-z0-9-]*(?:nganh-dien|dien-luc|dien-gio|dien-mat-troi|nhiet-dien|thuy-dien|xe-dien|nguon-dien|luoi-dien|tiet-kiem-dien|cung-ung-dien|nhu-cau-dien|phu-tai-dien|nang-luong|nltt|nlmt|evn|bess|pin-luu-tru|hat-nhan)[a-z0-9-]*/$'
WHERE name = 'Saigon Times';

-- VOV: /category/.../-post\d+.vov
UPDATE public.electricity_sources
SET list_link_pattern = '/[^/]+/[^/]*(?:nganh-dien|dien-luc|dien-gio|dien-mat-troi|dien-khi|dien-than|nhiet-dien|thuy-dien|xe-dien|nguon-dien|luoi-dien|tiet-kiem-dien|cung-ung-dien|nhu-cau-dien|phu-tai-dien|nang-luong|nltt|nlmt|evn|bess|pin-luu-tru|hat-nhan)[^/]*-post\d+\.vov'
WHERE name = 'VOV';

-- Tuổi Trẻ: URL /tag/nganh-dien.html trả 404, đổi sang category kinh-te (bao phủ năng lượng)
UPDATE public.electricity_sources
SET list_url = 'https://tuoitre.vn/kinh-te.htm',
    list_link_pattern = '/[^/]*(?:nganh-dien|dien-luc|dien-gio|dien-mat-troi|nhiet-dien|thuy-dien|xe-dien|nguon-dien|luoi-dien|tiet-kiem-dien|cung-ung-dien|nhu-cau-dien|nang-luong|nltt|nlmt|evn|bess|pin-luu-tru|hat-nhan)[^/]*-\d{10,}\.htm',
    consecutive_failures = 0,
    last_error = NULL,
    is_active = true
WHERE name = 'Tuổi Trẻ';

-- The Leader: HTTP 403 bot block, tạm disable
UPDATE public.electricity_sources
SET is_active = false,
    last_error = 'site blocks bot (HTTP 403)'
WHERE name = 'The Leader';

-- Xóa 4 tin false-positive (lộ diện, diễn ra, diện rộng)
DELETE FROM public.electricity_news WHERE original_url IN (
  'https://vov.vn/cong-nghe/danh-sach-iphone-tuong-thich-ios-27-lo-dien-nhieu-mau-bi-gach-ten-post1285630.vov',
  'https://vov.vn/o-to-xe-may/kham-pha-toyota-corolla-cross-the-he-moi-lo-dien-voi-nang-cap-hybrid-dang-chu-y-post1285470.vov',
  'https://vov.vn/xa-hoi/chieu-toi-nay-224-khong-khi-lanh-gay-mua-dong-dien-rong-o-bac-bo-post1285833.vov',
  'https://baoquocte.vn/dot-phim-ky-niem-cac-ngay-le-lon-2026-dien-ra-tren-toan-quoc-384329.html'
);
