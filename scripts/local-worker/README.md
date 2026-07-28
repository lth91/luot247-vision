# Worker chế độ bóng — chạy local LLM song song Haiku (bước 1)

Worker này chạy trên Mac, kéo việc từ bảng `llm_shadow_queue` (do edge
functions ghi vào mỗi khi gọi Haiku), chấm lại bằng model local với ĐÚNG
prompt production, ghi kết quả ngược lên. **Local chưa có quyền quyết gì** —
đây là giai đoạn so khớp lấy số liệu.

## Cài đặt (một lần)

1. Đã có Ollama + model từ bước 0 (`qwen3:14b`).
2. Tải 3 file thư mục này về Mac (vd `~/Desktop/LocalLLM/worker/`).
3. Đổi tên `.env.example` → `.env`, điền `SUPABASE_SERVICE_ROLE_KEY`
   (Supabase Dashboard → Settings → API → service_role). **GIỮ KÍN FILE NÀY.**

## Chạy

```bash
cd ~/Desktop/LocalLLM/worker
caffeinate -i python3 worker.py
```

- In từng việc đã chấm: `[12] giam_khao: dat (28.4s)`.
- Hết việc thì nghỉ 20s rồi hỏi tiếp — cứ để chạy cả ngày, tắt bằng Ctrl+C.
- Máy phải cắm sạc + không sleep (System Settings → Battery → Options →
  Prevent automatic sleeping...). Gập máy mang đi thì việc dồn lại, mở máy
  chạy tiếp — không mất gì (việc quá 3 ngày không chấm sẽ bị dọn).

## Theo dõi kết quả (SQL Editor)

```sql
-- Bảng điểm so khớp local vs Haiku theo ngày + lớp việc
SELECT * FROM v_shadow_summary;

-- Worker còn sống không (last_seen phải trong vòng vài phút)
SELECT * FROM local_worker_status;

-- Soi các ca hai bên phán khác nhau (để xem ai đúng)
SELECT created_at, task,
       haiku_verdict->>'verdict' AS haiku, local_verdict->>'verdict' AS local,
       payload->>'orig_title' AS bai
  FROM llm_shadow_queue
 WHERE status = 'done' AND task <> 'phan_loai'
   AND ((haiku_verdict->>'verdict') = 'trung') <> ((local_verdict->>'verdict') = 'trung')
 ORDER BY created_at DESC LIMIT 50;
```

## Nhịp làm việc dự kiến

Khối lượng đổ vào hàng đợi ~1.300–1.700 việc/ngày (tin lẻ 100%, giám khảo +
kiểm sớm 100%, bulk lấy mẫu 20%). MacBook M4 Pro chấm ~30s/việc → cần máy
trực ~12–14 giờ/ngày là theo kịp; thiếu giờ thì việc cũ tự trôi (ưu tiên chấm
việc MỚI trước — số liệu so khớp luôn tươi).

Sau ~1 tuần, gửi kết quả `v_shadow_summary` vào chat để chốt: lớp nào local
đủ điểm được trao quyền thật (bắt đầu cắt tiền cloud).
