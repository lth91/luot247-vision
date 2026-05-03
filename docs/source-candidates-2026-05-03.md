# Phase A — Source candidate probe (2026-05-03)

Probe 15+ ứng viên VN từ Phase A roadmap. Mục đích: xác định candidate viable trước khi INSERT prod (Phase B).

## Methodology

Mỗi candidate test qua curl với UA giả Chrome:
1. **Status check**: HTTP code khi fetch homepage
2. **RSS auto-discovery**: tìm `<link rel="alternate" type="application/rss+xml">` trong HTML head
3. **Common RSS paths**: thử `/rss`, `/feed`, `/feed.xml`, `/rss.xml`, `/index.rss`
4. **Item count**: parse RSS, đếm `<item>` (tránh empty feeds)
5. **Freshness**: kiểm `<pubDate>` mới nhất

Mac chạy probe ở VN nội địa nên DNS resolution VN OK. Edge function chạy Supabase (US/EU) có thể gặp thêm Edge-IP block hoặc anti-bot challenge.

## Kết quả

### ✅ Viable RSS — Phase B add ngay (Tier 3)

| Source | URL | Items | Fresh | Note |
|---|---|---|---|---|
| **Báo Chính Phủ** | `https://baochinhphu.vn/rss` | 50 | 03/05/2026 today | Tin chính phủ, có cả kinh tế/chính sách điện. KW pass rate dự kiến tốt vì có nhiều bài về Quy hoạch điện 8, EVN policy |
| **SGGP** | `https://www.sggp.org.vn/rss/kinh-te-3.rss` | 50 | 03/05/2026 today | Tin kinh tế Sài Gòn, ít trực tiếp ngành điện hơn nhưng có policy/đầu tư |

→ **Action Phase B**: Thêm 2 RSS này vào `FEEDS[]` array trong `supabase/functions/discovery-rss-news/index.ts`. Chạy classifier sàng lọc, kỳ vọng ~5-10% bài liên quan.

### ❌ Anti-bot D1N cookie (cần Mac Mini Scraper)

| Source | URL | Issue |
|---|---|---|
| NPT (Truyền tải điện) | `https://www.npt.com.vn` | JS challenge `D1N` cookie + reload — fetch đơn giản fail |
| Lao Động | `https://laodong.vn` (RSS) | Cùng D1N pattern, RSS endpoint trả HTML challenge |
| Báo Quân Đội Nhân Dân | `https://qdnd.vn` | 302 redirect loop |

→ **Action**: Mở GitHub issue trên `lth91/luot247-scraper` đề xuất extend Playwright scraper cover 3 site này. Out of scope plan này.

### ❌ DNS / connection fail (VN-only IP hoặc site dead)

| Source | URL | Issue |
|---|---|---|
| Vinacomin (TKV) | `tkv.com.vn` | `code=000` từ Mac VN — DNS / SNI fail |
| ERAV (Cục Điều tiết) | `erav.gov.vn` | `code=000` |
| EVNICT | `evnict.com.vn` / `evnict.vn` | `code=000` |

→ **Action**: Skip. Edge function ở US/EU càng khó hơn. Có thể retry sau via Mac Mini scraper nếu domain alive.

### ❌ HTML accessible nhưng RSS empty hoặc broken

| Source | URL | Issue |
|---|---|---|
| Báo Đầu Tư | `baodautu.vn` (nhiều .rss section) | RSS endpoints trả channel definition nhưng `<item>` count = 0. Có thể server lỗi temporarily. Theo dõi 1 tuần thử lại. |
| Báo Tin Tức TTXVN | `baotintuc.vn/rss/kinh-te.rss` | Trả HTML page thay vì XML |
| Hà Nội Mới | `hanoimoi.vn/rss/kinh-te.rss` | 200 nhưng items=0 |
| Kinh Tế Đô Thị | `kinhtedothi.vn/rss/feed/4.rss` | 200 nhưng items=0 (chỉ trả channel title) |
| Nhịp Cầu Đầu Tư | `nhipcaudautu.vn/rss/feed.rss` | 200 nhưng items=0 |
| Tạp chí NL VN | `nangluongvietnam.vn/rss` | "Trang báo lỗi" — cùng domain với active source `Hiệp hội NL Việt Nam` (chỉ 8 articles → confirm RSS hỏng từ trước) |

→ **Action**: Skip. Re-probe sau 1-2 tuần; nếu vẫn rỗng coi như dead.

### ⏳ Cần thêm probe (HTML list, không phải RSS)

| Source | URL | Status | Cần |
|---|---|---|---|
| PV Power | `https://pvpower.vn/vi` | 200 OK | Tìm list page (vd `/vi/tin-tuc`), inspect URL pattern bài detail, viết `list_link_pattern` regex + `article_content_selector` |
| Trung Nam Group | `https://trungnamgroup.com.vn` | 200 OK | Cùng workflow trên |

→ **Action Phase B**: 1-2h work mỗi site để inspect + viết selector. Nếu ổn add 2 source `feed_type='html_list'` (Tier 2).

## Decision matrix

| Verdict | Count | Sources |
|---|---|---|
| **Add now (Phase B)** | 2 | Báo Chính Phủ, SGGP — RSS, plug-and-play |
| **Add via html_list (Phase B+)** | 2 | PV Power, Trung Nam Group — cần inspect ~2h |
| **Mac Mini Scraper extension** | 3 | NPT, Lao Động, QĐND — out of scope plan, GH issue |
| **Skip / re-probe sau** | 7 | Vinacomin, ERAV, EVNICT, Báo Đầu Tư, Báo Tin Tức, Hà Nội Mới, Kinh Tế Đô Thị, Nhịp Cầu Đầu Tư, Tạp chí NL VN |

## Phase B tiếp theo

Tách 2 việc:
1. **Quick win**: migration thêm 2 RSS feed vào discovery-rss-news (5 phút work)
2. **Slow path**: inspect PV Power + Trung Nam Group HTML structure (1-2h work)

Sau migration, Phase C Telegram alert sẽ ping 🆕 Added cho mỗi nguồn mới — verify visible.

## Notes

- 12 active sources hiện tại (audit 03/05) chủ yếu là general news + EVN affiliates. Add Báo Chính Phủ + SGGP tăng diversity policy/governance content.
- Discovery-rss-news classifier đã tighten Phase 1 (threshold 0.85, blacklist regex) → false positive từ general news sources sẽ thấp.
- Mac Mini Scraper hiện cover 3 site (icon, evnhcmc, dienvadoisong). Mở rộng cover NPT/Lao Động/QĐND là follow-up có giá trị nhưng nằm ở repo riêng.
