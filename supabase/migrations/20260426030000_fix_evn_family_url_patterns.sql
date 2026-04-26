-- Fix list_link_pattern cho 3 nguồn EVN family — URL format các site này đã đổi từ
-- thiết kế cũ (/d6/news/...aspx) sang DotNetNuke mới (/d/vi-VN/news/...).
-- Hệ quả: 3 nguồn này không bắt được bài nào kể từ khi seed (xác minh 26/04/2026).
--
-- Format thực tế (xác minh bằng curl):
--   evn.com.vn       → /d/vi-VN/news/{slug}-NN-NNNN-NNNNNN  (cả news/ và news-gallery/)
--   eav.gov.vn       → /d/vi-VN/news-o/{slug}-NN-NN-NNNNN
--   evnpsc.com.vn    → /d6/vi-VN/news2/{slug}-N-NNN-NNN

UPDATE public.electricity_sources
SET list_link_pattern = '/d/vi-VN/news(?:-gallery)?/[^/]+-\d+-\d+-\d+',
    consecutive_failures = 0,
    last_error = NULL
WHERE name = 'EVN';

UPDATE public.electricity_sources
SET list_link_pattern = '/d/vi-VN/news-o/[^/]+-\d+-\d+-\d+',
    consecutive_failures = 0,
    last_error = NULL
WHERE name = 'Cục Điện lực';

UPDATE public.electricity_sources
SET list_link_pattern = '/d6/vi-VN/news2/[^/]+-\d+-\d+-\d+',
    consecutive_failures = 0,
    last_error = NULL
WHERE name = 'Trung tâm dịch vụ sửa chữa EVN';
