# Hướng dẫn Phase E — Auto-discovery & Playwright handover

## Mục tiêu
Tự động phát hiện domain mới có tin ngành điện và xử lý 2 đường:
- **RSS handover**: domain có RSS hợp lệ → edge crawler trực tiếp
- **Playwright handover**: domain JS-rendered hoặc anti-bot → Mac Mini scraper Playwright

Mục đích cuối: pipeline tự mở rộng nguồn không cần human, tiến tới thay
thế nhân viên duyệt tin tay.

---

## Kiến trúc tổng quan

```
discover-candidates  (cron 6h)
       │
       ├─ Probe Google News + general feeds
       │  → identify domain mới có ≥3 bài on-topic / 7 ngày
       │
       ├─ RSS path: site có /rss/, /feed/ hợp lệ
       │  └─ INSERT electricity_sources (feed_type='rss',
       │                                   pending_review=true,
       │                                   is_active=false)
       │
       └─ Playwright path: site rich HTML, no RSS
          └─ INSERT electricity_sources (feed_type='playwright',
                                          pending_review=true,
                                          is_active=false,
                                          scraper_config jsonb)
                                                  │
                                                  ▼
                              luot247-scraper trên Mac Mini
                              fetch_playwright_sources_from_db()
                              → crawl + extract + summarize
                              → insert electricity_news

pending-playwright-lifecycle  (cron daily 5:00 UTC)
       │
       ├─ Source pending có ≥1 bài / 24h → promote (is_active=true,
       │                                           pending_review=false)
       │
       └─ Source pending >7 ngày, 0 bài → reject (is_active=false,
                                                  pending_review=false)
```

---

## scraper_config jsonb format

Cho `feed_type='playwright'`, cột `scraper_config` lưu config Mac Mini cần:

```json
{
  "list_url": "https://example.vn/",
  "link_pattern": "^/[a-z0-9-]+\\d{4,}\\.html$",
  "content_selector": null,
  "category": "bao-chi",
  "wait_for": "a[href*='/news/']",
  "wait_after_load_ms": 4000,
  "user_agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
}
```

| Field | Bắt buộc | Mô tả |
|---|---|---|
| `list_url` | ✓ | Trang section/homepage chứa link bài |
| `link_pattern` | ✓ | Regex pathname matching bài detail (sau urlparse) |
| `content_selector` | tùy | CSS selector cho main content; null → fallback `<p>` join |
| `category` | ✓ | "bao-chi" \| "doanh-nghiep" \| "nha-nuoc" |
| `wait_for` | tùy | CSS selector Playwright đợi load xong |
| `wait_after_load_ms` | tùy | Sleep thêm sau load (default 0) |
| `user_agent` | tùy | UA override; mặc định scraper UA. Dùng Googlebot bypass Cloudflare |

---

## Threshold & timing

| Thông số | Giá trị | Lý do |
|---|---|---|
| Min sample articles trigger handover | 3 / 7 ngày | Tránh false positive trên domain rare-mention |
| Lifecycle promote window | 24h sau insert | Đủ thời gian Mac Mini chạy ≥1 cycle (cycle 1h) |
| Lifecycle reject TTL | 7 ngày | Cho thêm thời gian nếu Mac Mini lỗi tạm thời |
| `pipeline-health-check` alert | 6h chưa crawl | Mac Mini phải `update_source_crawled()` mỗi cycle |

---

## Migrations chính

| File | Nội dung |
|---|---|
| `20260506040000_playwright_handover_columns.sql` | Thêm cột `feed_type`, `scraper_config`, `pending_review` |
| `20260506050000_cron_pending_playwright_lifecycle.sql` | Cron + function `lifecycle_pending_playwright()` |
| `20260506060000_pipeline_health_check_cron.sql` | Cron 6h health check + Telegram alert |
| `20260506070000_mark_macmini_per_host_handover.sql` | Naming convention `Mac Mini (host.vn)` |

---

## Mac Mini setup

Repo `luot247-scraper` (riêng biệt, không phải luot247-vision).

### LaunchAgent
- `com.luot247.scraper` — chạy crawl mỗi giờ tại phút :20 (7:20→22:20 VN)
- `com.luot247.auto-pull` — `git fetch` mỗi 5 min, pull + kickstart nếu có commit mới

→ Push code GitHub → ≤5 min Mac Mini auto apply, **không cần SSH**.

### Yêu cầu code Mac Mini
- `db.update_source_crawled(source_id)` mỗi source mỗi cycle (không chỉ
  virtual source). Quên → `pipeline-health-check` báo "N nguồn chờ Mac Mini
  xử lý 6h" mãi.
- `topic_filter.is_electricity_topical(title)` áp dụng cho **TẤT CẢ** sources
  (cả static lẫn DB-driven). Trước đây skip static nhưng theleader.vn lọt
  bài SHB/NovaLand → bỏ exception.

---

## Debug commands

### Liệt kê source theo state
```sql
SELECT name, feed_type, is_active, pending_review, consecutive_failures,
       last_crawled_at, last_error
FROM electricity_sources
WHERE feed_type = 'playwright'
ORDER BY pending_review DESC, last_crawled_at DESC;
```

### Manual trigger lifecycle (không đợi cron 5:00 UTC)
```sql
SELECT * FROM public.lifecycle_pending_playwright();
-- returns (promoted int, rejected int)
```

### Check Mac Mini lần cuối touch source nào
```sql
SELECT name, last_crawled_at,
       now() - last_crawled_at AS staleness
FROM electricity_sources
WHERE feed_type = 'playwright' AND is_active = true
ORDER BY last_crawled_at NULLS FIRST;
```

### Xem cron history
```sql
SELECT jobname, status, start_time, return_message
FROM cron.job_run_details
WHERE jobid IN (
  SELECT jobid FROM cron.job
  WHERE jobname IN ('pending-playwright-lifecycle', 'pipeline-health-check-6h')
)
ORDER BY start_time DESC LIMIT 10;
```

---

## Common pitfalls

### 1. Cloudflare bypass
Site dùng Cloudflare anti-bot (HTTP 403 "Access Restricted"). Mac Mini default
UA fail. Workaround:
- Set `scraper_config.user_agent` = `"Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"`
- Site cho phép Googlebot trong robots.txt; reverse-DNS không nghiêm trên
  endpoint phổ thông
- Nếu vẫn 403 → switch sang RSS feed nếu có (xem nguoiquansat.vn case
  commit 33788cd)

### 2. URL slug Việt bỏ dấu match nhầm
`link_pattern = "(dien|nang-luong|evn|bess)"` substring match. Slug Việt bỏ
dấu của "**diện** mạo" / "**diễn** ra" cũng thành "dien" → false positive
(theleader.vn case, commit 27ad8d4 + ec8f42a). Workaround:
- Dùng `\b(dien|...)\b` word boundary
- Hoặc rely on title filter sau extract (Mac Mini extractor đã apply)

### 3. Race condition khi push fix
Push commit lên GitHub TRƯỚC khi Mac Mini auto-pull (5 min) → cycle scraper
fire ngay sau có thể chạy code cũ. Mitigation:
- Auto-pull (LaunchAgent `com.luot247.auto-pull`) đã giảm window xuống ≤5 min
- Bài lọt vẫn cần DELETE retroactive qua migration

### 4. Static vs DB-driven source naming
- `sources.py` static: `name="domain.vn"` → wrap thành `Mac Mini (domain.vn)`
  khi insert
- DB Phase E handover: `name="Mac Mini (domain.vn)"` ngay từ insert
- Filter logic phải uniform — KHÔNG dùng `name.startswith("Mac Mini")` để
  check DB-driven (sai vì static cũng wrap thành tên giống nhau sau insert)

---

## Mở rộng channel cho domain đã có source

Site đã có source nhưng bài quan trọng nằm trên channel khác (e.g.,
nangluongvietnam.vn có source root nhưng bài "Nhận định" nằm
`/nhan-dinh-phan-bien-kien-nghi`). Thay vì tăng `MAX_ARTICLES_PER_SOURCE`,
INSERT source row mới cho channel chuyên sâu:

```sql
INSERT INTO electricity_sources (
  name, base_url, list_url, feed_type,
  list_link_pattern, article_content_selector,
  category, tier, is_active
) VALUES (
  'Hiệp hội NL Việt Nam - Nhận định',
  'https://nangluongvietnam.vn',
  'https://nangluongvietnam.vn/nhan-dinh-phan-bien-kien-nghi',
  'html_list',
  '/.+-\d+\.html',
  'div.article-content, article.fck_detail, div.detail-content',
  'doanh-nghiep', 1, true
);
```

Naming convention: `<Tên báo> - <Channel>` (e.g., `Báo Công Thương - Năng lượng`).
Xem migrations `20260506130000`, `20260506140000`, `20260506150000`,
`20260506160000` cho 8 ví dụ Phase 1A/1B/1C/1D.
