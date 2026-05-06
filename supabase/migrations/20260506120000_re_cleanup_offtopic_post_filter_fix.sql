-- Re-cleanup 2 bài SHB + NovaLand bị crawl LẠI lúc 2026-05-06 01:26 UTC.
--
-- Root cause race condition:
--   - 01:0X UTC: push commit ec8f42a (filter fix) lên GitHub
--   - 01:20 UTC: scraper LaunchAgent fire → Mac Mini chưa pull ec8f42a
--                (auto-pull chưa được setup tại thời điểm đó)
--   - 01:26 UTC: scraper extract bài theleader.vn với code CŨ → lọt 2 bài
--   - 01:25-01:30 UTC: user manual git pull aa27b77 → Mac Mini có code mới
--   - Cycle 02:20 UTC trở đi sẽ chạy với code mới → không lọt nữa
--
-- Sau commit này, auto-pull (LaunchAgent com.luot247.auto-pull, 5 min interval)
-- sẽ tránh race condition này cho mọi push tương lai.

DELETE FROM electricity_news
WHERE id IN (
  '2b4cc66a-d9dd-40c4-9eae-5d522b628c08', -- "Diện mạo mới của SHB" (re-leak)
  '803fafbe-aa71-4c00-af3b-419684975761'  -- "Cổ phiếu NovaLand" (re-leak)
);
