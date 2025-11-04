# Hướng dẫn Schedule Edge Function daily-auto-views

## Mục tiêu
Tự động gọi edge function `daily-auto-views` mỗi 30 phút để tự động cộng view phân bổ trong ngày (7 AM - 10 PM GMT+7).

---

## Bước 1: Apply Migration vào Supabase

### Cách 1: Qua Supabase Dashboard (Khuyên dùng)

1. **Mở Supabase Dashboard**
   - Truy cập: https://supabase.com/dashboard
   - Chọn project của bạn

2. **Vào SQL Editor**
   - Click vào menu **SQL Editor** ở sidebar trái
   - Click **New Query**

3. **Copy và chạy SQL**
   - Mở file: `supabase/migrations/20251104020000_schedule_daily_auto_views.sql`
   - Copy toàn bộ nội dung
   - Paste vào SQL Editor
   - Click **RUN** hoặc nhấn `Ctrl+Enter` (Windows) / `Cmd+Enter` (Mac)

### Cách 2: Qua Supabase CLI (Nếu đã setup)

```bash
# Đảm bảo đã link project
npx supabase link --project-ref gklpvaindbfkcmuuuffz

# Push migration
npx supabase db push
```

---

## Bước 2: Cấu hình Service Role Key

Edge function cần Service Role Key để xác thực. Có 2 cách:

### Cách 1: Sử dụng Supabase Vault (Khuyên dùng - Bảo mật)

1. **Lấy Service Role Key**
   - Vào Supabase Dashboard > **Settings** > **API**
   - Tìm **service_role** key (secret key, không phải anon key)
   - Copy key này

2. **Lưu vào Vault**
   - Vào Supabase Dashboard > **Database** > **Vault**
   - Click **New Secret**
   - Name: `service_role_key`
   - Secret: Paste service role key đã copy
   - Click **Save**

3. **Update Migration để dùng Vault**
   - Migration đã tự động tìm key trong vault
   - Nếu đã lưu vào vault, function sẽ tự động dùng

### Cách 2: Sử dụng Custom GUC (Nếu không có Vault)

1. **Lấy Service Role Key**
   - Vào Supabase Dashboard > **Settings** > **API**
   - Copy **service_role** key

2. **Set trong Database Settings**
   - Vào Supabase Dashboard > **Database** > **Settings**
   - Tìm phần **Custom GUCs** hoặc **Database Configuration**
   - Thêm: `app.service_role_key = 'your-service-role-key-here'`
   - Lưu ý: Cách này kém bảo mật hơn

---

## Bước 3: Kiểm tra Cron Job đã chạy

### Kiểm tra trong Supabase Dashboard

1. **Vào SQL Editor**
2. **Chạy query sau để xem cron jobs:**

```sql
SELECT * FROM cron.job;
```

3. **Bạn sẽ thấy job `call-daily-auto-views` với schedule `*/30 * * * *`**

### Kiểm tra Logs

1. **Vào Supabase Dashboard > Edge Functions > daily-auto-views**
2. **Xem Logs** để kiểm tra function có được gọi không
3. **Nếu thấy logs mỗi 30 phút** = Cron job hoạt động đúng

---

## Bước 4: Test thủ công

### Test function gọi edge function

Chạy SQL này trong Supabase Dashboard:

```sql
SELECT public.call_daily_auto_views();
```

**Kết quả mong đợi:**
- Nếu trong giờ 7 AM - 10 PM: Sẽ thêm view vào `view_logs2`
- Nếu ngoài giờ: Sẽ skip và không thêm view

### Kiểm tra view đã được thêm

```sql
-- Xem số view logs mới nhất
SELECT COUNT(*) as total_logs
FROM view_logs2
WHERE viewed_at >= NOW() - INTERVAL '1 hour';

-- Xem view logs theo giờ
SELECT 
  DATE_TRUNC('hour', viewed_at AT TIME ZONE 'Asia/Ho_Chi_Minh') as hour,
  COUNT(*) as views
FROM view_logs2
WHERE viewed_at >= NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```

---

## Cách hoạt động

### Timeline một ngày:

- **00:00 - 6:59 AM (GMT+7)**: Cron job chạy nhưng edge function tự skip (không thêm view)
- **7:00 AM**: Edge function bắt đầu thêm view
- **7:00 - 10:00 PM**: Mỗi 30 phút sẽ thêm view cho khoảng đó
- **10:00 PM - 6:59 AM**: Edge function tự skip

### Phân bổ view:

- **Tổng mục tiêu**: ~700 views/ngày
- **Chia thành**: 30 khoảng 30 phút (7 AM - 10 PM)
- **Peak hours**: Giờ cao điểm (8-9 AM, 12-1 PM, 7-9 PM) sẽ có nhiều view hơn
- **Mỗi lần chạy**: Chỉ thêm view cho khoảng 30 phút hiện tại

---

## Xử lý lỗi

### Lỗi: "Failed to call daily-auto-views"

**Nguyên nhân**: Service Role Key chưa được cấu hình

**Giải pháp**:
1. Kiểm tra đã lưu key vào Vault chưa
2. Hoặc set Custom GUC trong Database Settings
3. Kiểm tra key có đúng không (service_role, không phải anon)

### Lỗi: "Function not found"

**Nguyên nhân**: Edge function chưa được deploy

**Giải pháp**:
1. Deploy edge function: `npx supabase functions deploy daily-auto-views`
2. Hoặc kiểm tra trong Dashboard > Edge Functions

### Cron job không chạy

**Kiểm tra**:
```sql
SELECT * FROM cron.job WHERE jobname = 'call-daily-auto-views';
```

**Nếu không có**:
- Chạy lại migration SQL
- Kiểm tra extension pg_cron đã được enable chưa

---

## Tóm tắt

✅ **Đã làm:**
1. Tạo migration file để schedule cron job
2. Tạo function gọi edge function qua HTTP
3. Schedule chạy mỗi 30 phút

⏳ **Cần làm:**
1. Apply migration vào Supabase (chạy SQL)
2. Cấu hình Service Role Key (lưu vào Vault)
3. Kiểm tra cron job đã chạy

🎯 **Kết quả:**
- Edge function sẽ tự động chạy mỗi 30 phút
- Tự động thêm view phân bổ trong ngày (7 AM - 10 PM)
- Không cần can thiệp thủ công

