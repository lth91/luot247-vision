# Bake-off cú viết P3 — DeepSeek V4-Flash, GPT-5 Mini & Gemini 3.1 Flash-Lite đấu mù với Haiku 4.5

Mục tiêu: kiểm chứng có model API rẻ hơn Haiku 7-20 lần mà viết tin tiếng Việt
đạt chuẩn luot247 không. Nếu đậu → phương án ④ trong hồ sơ 10/08: cú viết
(~$4.7/ngày, layer cloud lớn nhất còn lại) chuyển sang model rẻ, không cần chờ
máy 96-128GB chạy 70B.

Thiết kế: cùng bộ 50 bài đã đăng thật, cùng NGUYÊN VĂN system prompt production,
cùng luật retry số từ. Baseline Haiku lấy thẳng bản đã viết trong queue
(điều kiện production thật, $0 phát sinh). Người chấm KHÔNG biết bản nào của
model nào.

## Các bước

**1. Xuất bộ đề** (trong ngày, trước 19:50 UTC vì queue bị purge hằng đêm):
chạy `export_bakeoff.sql` trong SQL Editor → copy ô kết quả → trên MacBook:

```bash
mkdir -p ~/Desktop/LocalLLM/bake-off && cd ~/Desktop/LocalLLM/bake-off
pbpaste > bo_de.json
```

**2. Chuẩn bị key**: chép 4 file (`run_bakeoff.py`, `score_bakeoff.py`,
`env.example`, `bo_de.json`) vào cùng thư mục, rồi:

```bash
mv env.example .env
nano .env   # điền DEEPSEEK_API_KEY + OPENAI_API_KEY
```

- DeepSeek: đăng ký https://platform.deepseek.com, nạp ~$2.
- OpenAI: https://platform.openai.com, nạp $5 (mức tối thiểu).
- Gemini: https://aistudio.google.com → Get API key (có free tier, 50 bài có
  thể không mất đồng nào).
- Chi phí toàn bộ test ước ~$0.4-0.6 cho cả 3 hãng.

**3. Chạy** (~20-40 phút, ~300 cú gọi kể cả retry; bị ngắt cứ chạy lại — tự nối):

```bash
python3 run_bakeoff.py
```

Ra 3 file:

| File | Gửi ai |
|---|---|
| `phieu_cham.csv` | Người chấm (mở bằng Google Sheets/Excel) |
| `bai_goc.md` | Người chấm — đối chiếu dữ kiện |
| `ket_qua_tho.json` | **GIỮ KÍN** — chứa đáp án bản nào của model nào |

**4. Chấm mù**: gửi phiếu + bài gốc cho 2-3 nhân viên (mỗi người 1 bản sao).
Luật chấm ghi ở cuối README này — copy gửi kèm.

**5. Tổng kết**:

```bash
python3 score_bakeoff.py phieu_thuy.csv phieu_minh.csv --cu-viet-ngay 600
```

In bảng so sánh + ghi `bao_cao_bakeoff.md` (điểm TB, thắng bài, % sai dữ kiện,
kỷ luật số từ, $/bài và $/ngày quy đổi) — dùng thẳng cho hồ sơ 10/08.

## Luật chấm (gửi người chấm)

> Mỗi bài có 2-4 bản tin (A/B/C/D) viết từ cùng một bài gốc (xem `bai_goc.md`).
> Với TỪNG bản, điền:
> - **diem**: 1-5 (5 = đăng được ngay, văn mượt, đủ dữ kiện; 3 = tạm, phải sửa
>   nhẹ; 1 = không dùng được).
> - **sai_du_kien**: đánh `x` nếu bản đó SAI hoặc BỊA tên/số liệu/thời gian so
>   với bài gốc (lỗi nặng nhất).
> - **ghi_chu**: tự do (lỗi chính tả, văn cứng, giật gân...).
> Không chấm theo thứ tự A/B/C/D — thứ tự đã trộn ngẫu nhiên từng bài.

## Lưu ý

- **DeepSeek là hãng Trung Quốc** — dữ liệu gửi sang server của họ. Bộ đề toàn
  tin báo chí công khai nên không nhạy cảm, nhưng cần sếp gật đầu điểm này
  trước khi dùng production.
- Ứng viên chỉ thấy 4000 ký tự đầu bài gốc (bản lưu trong queue); Haiku ngoài
  production thấy bài đầy đủ — thiệt nhẹ cho ứng viên với bài dài, chấp nhận được.
- GPT-5 Mini là model có suy nghĩ (reasoning) — script đặt `reasoning_effort=low`;
  token suy nghĩ tính tiền output nên $/bài thực tế do script tự cộng từ usage,
  không đoán. Gemini thì script TẮT suy nghĩ (`reasoning_effort=none`) — nếu
  Google báo lỗi 400 không nhận tham số, đặt `GEMINI_REASONING_EFFORT=` (rỗng)
  trong `.env`.
- Kết quả chỉ là hồ sơ đề xuất. **Đổi model production phải có release note**
  được sếp duyệt (luật hiện hành).
- Nếu tên model/giá đổi (DeepSeek hay đổi): sửa trong `.env`, không sửa code.
