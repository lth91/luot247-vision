-- Re-enable 2 nguồn từ Nhóm 1 (auto-disabled 22/04 do timeout/block transient):
-- 1. The Leader: site phục hồi, không còn 403, regex còn match
-- 2. EVN miền Trung (CPC): có RSS feed (DotNetNuke API GetFeed) — chuyển sang feed_type='rss'
--
-- Các nguồn khác giữ disabled (EVN HCM, ICON, Nhiệt điện Ninh Bình, các site JS-rendered):
-- không có RSS endpoint, không có path extract bằng fetch + regex.

-- The Leader: re-enable nguyên trạng (regex cũ vẫn work)
UPDATE public.electricity_sources
SET is_active = true,
    consecutive_failures = 0,
    last_error = NULL
WHERE name = 'The Leader';

-- CPC: convert HTML scrape → RSS, list_url đổi sang endpoint GetFeed
UPDATE public.electricity_sources
SET is_active = true,
    consecutive_failures = 0,
    last_error = NULL,
    feed_type = 'rss',
    list_url = 'https://cpc.vn/DesktopModules/NewsServices/API/News/GetFeed',
    list_link_pattern = NULL
WHERE name = 'EVN miền Trung (CPC)';
