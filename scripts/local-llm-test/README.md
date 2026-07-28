# Bước 0 — Test local LLM trên MacBook (trước khi mua máy / chuyển hệ)

Mục tiêu: đo xem model chạy LOCAL có phán **giống Haiku + giống nhân viên** đủ mức
để thay 2 lớp rẻ nhất của pipeline không (phân loại tin nhân viên gửi + kiểm trùng).
**Không đụng gì tới production** — chỉ đọc dữ liệu đã có sẵn đáp án.

## Chuẩn bị (~15 phút, làm 1 lần)

1. **Cài Ollama**: tải bản macOS tại <https://ollama.com/download>, mở app lên
   (thấy icon con lạc đà trên menu bar là được).
2. **Kéo model** (mở Terminal):
   ```bash
   ollama pull qwen3:14b     # ~9GB — ứng viên chính
   ollama pull gemma3:12b    # ~8GB — ứng viên so tài
   ```
3. **Xuất bộ test**: mở Supabase SQL Editor, chạy từng câu trong
   `export_testset.sql`, bấm **Export → JSON** sau mỗi câu:
   - Câu 1 → lưu tên `phanloai.json` (150 tin nhân viên đã đăng)
   - Câu 2 → lưu tên `trung.json` (cặp tin nghi trùng đã có người phán)
4. Đặt 2 file JSON đó **cùng thư mục** với `run_test.py` trên máy Mac.

## Chạy test

```bash
# Chạy nháp 30 ca cho nhanh (~10-15 phút) xem mọi thứ trơn tru chưa:
python3 run_test.py --model qwen3:14b --limit 30

# Chạy full (~1.5-2.5 giờ/model — cắm sạc, cứ để máy chạy):
python3 run_test.py --model qwen3:14b
python3 run_test.py --model gemma3:12b
```

Script in tiến độ từng ca (✓/✗). Xong sẽ có file `ket_qua_qwen3_14b.md` —
**gửi file này vào chat** để phân tích và quyết bước tiếp theo.

## Ngưỡng ĐẠT (đã in sẵn trong file kết quả)

| Bài | Chỉ số | Ngưỡng |
|---|---|---|
| Phân loại | Khớp chuyên mục với Haiku | ≥ 85% |
| Phân loại | Gắn cờ vi phạm oan (tin đã đăng) | ≤ 10% |
| Kiểm trùng | Khớp phán quyết nhân viên | ≥ điểm Haiku baseline in kèm |
| Kiểm trùng | Loại oan | ≤ 5% |
| Tốc độ | Trung bình mỗi ca | ≤ 20 giây |

- **Đậu cả 2 bài** → local đủ tin cậy cho lớp phân loại (tiết kiệm ~$4.7/ngày),
  và có cơ sở thử tiếp lớp giám khảo. Lúc đó mới bàn mua máy trực 24/7.
- **Trượt** → thử model lớn hơn (`qwen3:32b` — cần máy RAM ≥ 36GB, đây chính là
  lúc con Mac Studio M4 Max mới có lý do tồn tại) hoặc ở lại Haiku.

## Ghi chú

- Bộ kiểm trùng là **vùng xám thật**: toàn ca Haiku từng cho qua rồi nhân viên
  phán lại — khó hơn nhiều so với test tự bịa, nên điểm sẽ không đẹp lung linh;
  cái cần so là **local có ≥ Haiku trên cùng bộ đề hay không**.
- Ở bài kiểm trùng, local được xem **cả nội dung** tin đã đăng, trong khi Haiku
  production chỉ được xem tiêu đề (tiết kiệm token cloud). Đây là lợi thế CÓ
  CHỦ ĐÍCH — khi triển khai local thật cũng sẽ cấu hình như vậy vì token local
  miễn phí. So sánh với baseline Haiku là so "làm được việc", không phải so
  cùng-đề-cùng-điều-kiện.
- Bộ phân loại lấy từ tin ĐÃ ĐĂNG (không có content của tin bị loại — hệ thống
  không lưu), nên bài này đo "khớp Haiku + không loại oan", chưa đo khả năng bắt rác.
- MacBook M4 Pro 24GB: chạy 14B thoải mái; **không** chạy `qwen3:32b` trên máy
  này (thiếu RAM — sẽ tràn swap, chậm không dùng được).
