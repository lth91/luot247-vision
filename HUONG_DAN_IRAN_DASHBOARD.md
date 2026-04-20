# Hướng dẫn deploy trang `/iran`

Setup toàn bộ pipeline Iran dashboard trong 4 bước.

---

## Bước 0: Merge code lên `main` (nếu chưa)

Branch hiện tại: `claude/project-summary-mPGD0`. Merge vào `main` để Vercel build production.

---

## Bước 1: Deploy 3 edge function

Cần Supabase CLI. Nếu chưa có:

```bash
npm i -g supabase
supabase login        # mở browser, paste token từ dashboard
```

Chạy script tại thư mục gốc repo:

```bash
bash deploy_iran_functions.sh
```

Script sẽ `supabase link --project-ref gklpvaindbfkcmuuuffz` rồi deploy lần lượt `fetch-iran-news`, `fetch-gdelt-iran`, `build-iran-timeline`.

---

## Bước 2: Chuẩn bị service_role key (cho cron)

Vào Supabase Dashboard → **Settings** → **API** → copy **service_role** key (secret, không phải anon).

Có 2 cách đưa key vào cron:

**Cách A — Vault (khuyên dùng):**
- Database → Vault → **New secret**
- Name: `service_role_key`
- Value: dán key
- SQL ở Bước 3 sẽ tự đọc từ Vault, không cần sửa.

**Cách B — Hardcode:**
- Mở `setup_iran_dashboard.sql`, tìm dòng `v_service_role_key := 'PASTE_SERVICE_ROLE_KEY_HERE'`, thay bằng key thật.

---

## Bước 3: Chạy SQL setup

Vào Supabase Dashboard → **SQL Editor** → **New query** → paste toàn bộ nội dung file `setup_iran_dashboard.sql` → **Run**.

Script sẽ tự làm:
1. Tạo 3 bảng `news_iran`, `iran_events`, `iran_stats` + indexes.
2. Bật RLS public read.
3. Thêm vào publication `supabase_realtime` (để UI auto update).
4. Bật extension `pg_cron` + `pg_net`.
5. Tạo function `call_iran_edge(fn_name)` — gọi edge function qua HTTP.
6. Schedule 3 cron job: `iran-fetch-news` (2 phút), `iran-fetch-gdelt` (5 phút), `iran-build-timeline` (10 phút).
7. **Chạy ngay 1 lần** `fetch-iran-news` và `fetch-gdelt-iran` để có dữ liệu, không cần đợi.

Script idempotent — chạy lại không hư gì.

---

## Bước 4: Verify

Trong SQL Editor chạy lần lượt:

```sql
-- Có dữ liệu chưa?
SELECT count(*), source FROM public.news_iran GROUP BY source;

-- Cron đã chạy chưa?
SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'iran-%';

-- Xem 10 tin mới nhất
SELECT published_at, source_name, title FROM public.news_iran
ORDER BY published_at DESC LIMIT 10;

-- Counters
SELECT stat_key, stat_value, updated_at FROM public.iran_stats;
```

Nếu bảng rỗng sau ~1 phút, vào **Edge Functions → Logs** xem lỗi của `fetch-iran-news`.

Sau đó mở `https://www.luot247.com/iran` — feed sẽ có tin, LIVE badge nhấp nháy, map hiện pin, timeline hiện event.

---

## Troubleshooting

| Triệu chứng | Nguyên nhân | Cách khắc phục |
|---|---|---|
| Trang trắng, console báo table không tồn tại | Quên Bước 3 | Chạy `setup_iran_dashboard.sql` |
| Cron không chạy | Chưa bật extension | Database → Extensions → bật `pg_cron` + `pg_net` |
| Edge function return 401 | service_role key sai/thiếu | Kiểm tra Vault hoặc hardcode ở `call_iran_edge` |
| Feed có tin nhưng map trống | Chỉ GDELT có lat/lng, RSS thì không | Bình thường — map chỉ hiện pin từ GDELT |
| Reuters/CNN báo 403 trong log | Đôi lúc chặn bot | Các nguồn khác vẫn chạy, không dừng pipeline |

## Tắt cron (nếu cần)

```sql
SELECT cron.unschedule('iran-fetch-news');
SELECT cron.unschedule('iran-fetch-gdelt');
SELECT cron.unschedule('iran-build-timeline');
```
