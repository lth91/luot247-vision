# Thiết kế cơ chế ĐIỂM → TIỀN MẶT cho luot247-vision

> Tài liệu dành cho chủ sản phẩm. Mục tiêu: biến điểm thành tiền mặt thật một cách **chặt chẽ** (chống gian lận, kiểm toán được) và **công bằng** (thưởng đúng người, phạt đúng mức, có đường khiếu nại).

---

## 1. Năm nguyên tắc cốt lõi

1. **Sổ cái là sự thật, số dư chỉ là cache.** Mọi cộng/trừ điểm phải là một dòng giao dịch bất biến trong `points_ledger`. `profiles.total_points` chỉ là tổng dẫn xuất. Không bao giờ UPDATE điểm trực tiếp nữa.
2. **Tích điểm tự do, rút tiền có cổng.** Giữ UX đăng ký mở để không cản người dùng thật, nhưng đặt KYC + ngưỡng đủ điều kiện ngay tại bước **payout**. Account ảo farm bao nhiêu cũng được, nhưng không rút được tiền.
3. **Trả tiền sau khi đã đánh giá rủi ro, không trả trước.** Điểm từ tin mới chỉ "chín" (mature) sau cửa sổ hậu kiểm 7–14 ngày. Tiền chỉ rút được từ điểm đã chín. Triệt tiêu hit-and-run.
4. **Phạt tỷ lệ với mức độ vi phạm, và phạt phải "cắn".** Gỡ vì lỗi hệ thống = không phạt; sai sự thật = thu hồi toàn bộ + phạt nặng + strike. Cho phép số dư âm để không thể "xóa nợ" bằng cách về 0.
5. **Minh bạch hai chiều + bốn mắt.** User xem được từng dòng điểm và có quyền khiếu nại. Mọi thao tác phạt/cộng tay của admin đều để lại dấu vết (`actor_id`) và người duyệt payout phải khác người duyệt tin.

---

## 2. Mô hình điểm đề xuất

### 2.1. Tách hai loại điểm

| Loại | Cột | Tính chất | Dùng để |
|------|-----|-----------|---------|
| **Điểm uy tín** | `profiles.lifetime_points` | Chỉ tăng, không bao giờ giảm | Leaderboard, mở khóa quyền lợi, đánh giá độ tin cậy |
| **Số dư khả dụng** | `profiles.redeemable_balance` | Tăng/giảm được, **cho phép âm** | Quy ra tiền mặt |

Phạt trừ vào `redeemable_balance` (được phép xuống âm). `lifetime_points` chỉ phản ánh đóng góp lịch sử, không bị phạt làm sai lệch xếp hạng. Bỏ `GREATEST(0, …)` trên số dư khả dụng — đây là điều kiện để phạt thật sự có hiệu lực.

### 2.2. Thưởng theo CHẤT LƯỢNG, không theo số lượng

Hiện tại +10 cứng cho mọi tin pass auto-check → khuyến khích farm "vừa đủ pass". Thay bằng:

- **Base khi đăng:** giảm xuống **+5** (escrow, chưa chín).
- **Hệ số chất lượng từ LLM:** thêm field `news_value: 0..1` vào prompt Haiku (tính thời sự, độ quan trọng, độ cụ thể). Điểm đăng = `round(5 * news_value)`. Nếu `news_value < 0.4` → vẫn đăng nhưng **+0 điểm** (hoặc `rejected_low_value`).
- **Bonus engagement (tùy chọn, giai đoạn sau):** cron định kỳ cộng bonus theo lượt xem THẬT (loại trừ `daily-auto-views`) và số favorites, có TRẦN/tin để chống bơm. Idempotent qua `last_awarded_views`.
- **Sửa lỗ hổng plausibility:** đổi `is_plausible !== false` thành `=== true` (mặc định KHÔNG hợp lý nếu LLM thiếu field) để đóng bypass prompt-craft.

### 2.3. Escrow / hold period

- Tin được đăng → ghi ledger `award_publish` với `matured_at = created_at + 7 days`.
- Điểm pending **tính vào `lifetime_points`/leaderboard ngay**, nhưng **chỉ vào `redeemable_balance` khi đã chín** và tin không bị gỡ.
- Cron hằng ngày "mature" các award quá hạn. Nếu trong cửa sổ tin bị gỡ → hủy thẳng award pending (không cần clawback).

### 2.4. Tỷ lệ quy đổi gợi ý

- Cấu hình ở bảng `payout_config(points_per_unit_currency, currency='VND', min_redeem_points, hold_days, payout_schedule)`.
- **Đặt rẻ và thận trọng lúc đầu** (vì chi phí gian lận chưa rõ), có thể tăng sau. Ví dụ khởi điểm: **1 điểm = 500–1.000 VND**, ngưỡng rút tối thiểu **200 điểm + ≥ 20 tin approved**.
- Payout chạy **theo kỳ** (cuối tháng) sau `hold_days`, để cửa sổ hậu kiểm trong kỳ kịp đóng.

---

## 3. Cơ chế PHẠT phân tầng

### 3.1. Bảng mức phạt theo lý do gỡ

Admin **bắt buộc chọn lý do** khi gỡ tin (UI dialog có RadioGroup + ô note bắt buộc):

| `takedown_reason` | Tình huống | Điểm | Strike | Ghi chú |
|-------------------|-----------|------|--------|---------|
| `system` | Lỗi hệ thống / trùng do crawl / lý do biên tập (KHÔNG phải lỗi tác giả) | **0** (chỉ hủy award nếu chưa chín) | 0 | Không đụng `rejected_count` |
| `format` | Lỗi nhẹ: sai category, lặp ý, văn phong | Hủy award + **−5** | 1 | |
| `factual` | Sai sự thật / bịa số liệu / không kiểm chứng được | Hủy award + **−20** | 2 | Telegram alert |
| `severe` | Bịa hoàn toàn, đạo văn, spam trục lợi, nội dung cấm | Hủy award + **−50** | 3 | Telegram alert + cờ profiles |

- **Tái phạm cùng loại** (đếm trong 90 ngày qua ledger): lần 2 ×1.5, lần 3+ ×2. `factual` lặp ≥3 lần → tự đẩy lên `severe`. Dùng helper SQL `calc_takedown_penalty(user_id, reason)` cho cả trigger và edge function.
- Hệ số đã áp được ghi vào `points_ledger.note` để minh bạch khi khiếu nại.

### 3.2. Strike & đình chỉ (escalation tự động)

Thêm vào `profiles`: `strike_count int`, `submit_blocked_until timestamptz`, `payout_suspended boolean`.

- **3 strike** → khóa gửi tin 7 ngày + alert admin.
- **5 strike** → khóa gửi tin 30 ngày.
- **8 strike** → `payout_suspended=true`, chờ admin review tay.
- **Decay công bằng:** cron hằng tháng giảm 1 strike cho user không vi phạm 60 ngày.
- `submit-news` thêm guard ngay sau verify JWT: nếu `submit_blocked_until > now()` hoặc `payout_suspended` → 403.

### 3.3. Phân biệt lỗi hệ thống vs lỗi tác giả

- Mọi đường gỡ **tự động** (cleanup pipeline, reject-rule migration) phải set `takedown_reason='system'` → delta 0. User không bị phạt oan vì lý do biên tập.
- Ngược lại để tránh kẻ xấu cố tình tạo tin bị auto-cleanup để né phạt: phân loại nguồn gỡ rõ ràng, và tin đã từng approved + có award thì cleanup vẫn phải đi qua trigger ghi ledger.

### 3.4. Sửa lỗ hổng DELETE không trừ điểm (BẮT BUỘC)

Đây là đường rút ruột số 1 khi điểm = tiền. Giải pháp: **cấm hard-delete tin user-submitted, ép soft-delete.**

```sql
-- BEFORE DELETE ON news: chặn xóa cứng tin của user
CREATE TRIGGER block_hard_delete_user_news
BEFORE DELETE ON public.news
FOR EACH ROW WHEN (OLD.submitted_by IS NOT NULL)
EXECUTE FUNCTION raise_soft_delete_required();
-- → buộc gỡ qua UPDATE is_approved=false + takedown_reason
```

- Thêm cột `news.takedown_reason / takedown_at / takedown_by / takedown_note`.
- Soft-delete giữ được bằng chứng để xử khiếu nại tiền.
- **Sửa logic gỡ hiện tại** (`award_points_on_news` nhánh UPDATE true→false): thay −5 phẳng bằng lookup theo `takedown_reason`, và **thu hồi đủ +award gốc** để gỡ tin xấu về net ≤ 0 — triệt động cơ "đăng bừa, bị gỡ vẫn lời".
- **Idempotent:** dùng `idempotency_key='takedown:'||news_id` để toggle is_approved nhiều lần không phạt trùng. Re-approve (false→true) sau gỡ nhầm → ghi `reversal` hoàn lại điểm (vá bất công hiện tại: re-approve không hoàn điểm).
- Giảm `approved_count` khi gỡ để thống kê không thổi phồng.

---

## 4. Chống gian lận

### 4.1. KYC tại PAYOUT, không tại đăng ký (must)

Bảng `kyc_verification(user_id PK, status CHECK('none','pending','verified','rejected'), full_name, national_id_hash UNIQUE, phone UNIQUE, bank_account_hash, verified_at, reviewed_by)`.

- **`national_id_hash` UNIQUE + `phone` UNIQUE là chốt chặn sockpuppet:** 1 CCCD / 1 SĐT chỉ payout 1 lần. Bao nhiêu account ảo cũng không rút trùng.
- Edge `request-payout` chặn nếu `status != 'verified'`.

### 4.2. Ngưỡng đủ điều kiện + hold period

- Rút được khi: `redeemable_balance ≥ min_redeem` **VÀ** không còn award pending chưa chín **VÀ** không có strike `factual/severe` trong N ngày **VÀ** account đủ tuổi (≥ 30 ngày) / `approved_count` đủ.
- Kẻ farm hit-and-run không kịp rút trước khi bị soi.

### 4.3. Chống đạo văn / copy báo ngoài (must)

Đây hiện là cách farm an toàn nhất (dedup chỉ so title nội bộ). Trong `submit-news`:
- Nếu có `rawUrl` → fetch nội dung gốc, so similarity với content user gửi; trùng cao → `rejected_plagiarism`.
- Lưu simhash/minhash của **BODY** (không chỉ title) vào `news`; check trùng body với tin đã có.
- Thêm `rejected_plagiarism` vào CHECK constraint của `submission_log`.

### 4.4. Chống chia nhỏ sự kiện & farm số lượng

- Gán `event_cluster_id` (LLM/embedding); trong 24–48h nếu user đã có tin approved cùng cluster → tin sau +0 điểm.
- Trần riêng cho tin ĐƯỢC THƯỞNG: tối đa 5–10 tin/ngày/user, vượt thì vẫn đăng nhưng +0.

### 4.5. Tín hiệu chống Sybil ở tầng request

- `submission_log` thêm cột `ip_hash`, `device_hash`, `user_agent` (edge function ghi).
- Cron flag: nhiều `user_id` mới cùng IP/UA → đưa vào review, `payout_frozen`. Bảng `fraud_flag(user_id, reason, severity, resolved)` + `profiles.payout_frozen`.

### 4.6. (Khuyến nghị) Siết đăng ký nhẹ

`config.toml` bật `enable_confirmations=true` (email confirm). Giảm noise/spam farm dù KYC-tại-payout mới là chốt chính.

### 4.7. KHÔNG thưởng theo view/like thô

Hệ thống đã có `daily-auto-views` giả lập traffic → tuyệt đối không quy view/like thành tiền trực tiếp. Nếu thưởng theo phổ biến, chỉ dùng tín hiệu khó giả (unique authenticated reader + dwell time + chống cùng-IP) và vẫn qua hold + clawback.

---

## 5. Kiểm toán & minh bạch

### 5.1. Ledger điểm bất biến (must — nền tảng của tất cả)

```sql
CREATE TABLE public.points_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  delta int NOT NULL,                  -- >0 thưởng, <0 phạt
  reason_code text NOT NULL CHECK (reason_code IN (
    'award_publish','bonus_engagement','takedown_system','takedown_format',
    'takedown_factual','takedown_severe','auto_reject','appeal_refund',
    'admin_manual','payout_debit','reversal')),
  status text DEFAULT 'matured' CHECK (status IN ('pending','matured','cancelled')),
  matured_at timestamptz,
  news_id uuid,                        -- không FK cứng để sống sót qua DELETE
  submission_log_id uuid REFERENCES submission_log,
  actor_id uuid REFERENCES auth.users, -- NULL = hệ thống; = admin nếu thao tác tay
  actor_role text,
  note text,
  idempotency_key text UNIQUE,         -- 'submit:'||news_id, 'takedown:'||news_id ...
  created_at timestamptz DEFAULT now()
);
```

- **Append-only:** trigger `BEFORE UPDATE OR DELETE → RAISE EXCEPTION`. Sửa sai = ghi dòng `reversal` đối ứng.
- `profiles.redeemable_balance` / `lifetime_points` là **cache**, cập nhật qua trigger `AFTER INSERT ON points_ledger`.
- RLS: user SELECT own, admin SELECT all, INSERT chỉ service_role/trigger.
- Index `(user_id, created_at DESC)`.

### 5.2. VÁ NGAY lỗ hổng RLS — user tự sửa điểm (must, làm trước mọi thứ)

Policy hiện tại `"Users can update own profile" FOR UPDATE USING (auth.uid()=id)` **không giới hạn cột, không WITH CHECK** → bất kỳ user nào cũng chạy được `supabase.from('profiles').update({total_points: 9999999})` qua anon key hardcode. **Đây là ăn cắp tiền không cần kỹ năng.**

Giải pháp: **tách điểm sang bảng riêng** `user_points` chỉ service_role/trigger ghi (RLS deny UPDATE cho authenticated, user chỉ SELECT). Hoặc `REVOKE UPDATE(total_points, lifetime_points, redeemable_balance, approved_count, rejected_count) ON profiles FROM authenticated` và đổi policy update chỉ cho cột hồ sơ. **Khuyến nghị mạnh: bảng riêng.**

### 5.3. Đối soát payout

- Bảng `payout_periods(id, period_label, cutoff_at, status('open','snapshotted','paid'), created_by)`.
- Bảng `payout_snapshots(id, period_id, user_id, points_balance, ledger_cutoff_ts, amount_money, rate_applied, status('pending','approved','paid','held'))`.
- Khi chốt kỳ: RPC SECURITY DEFINER tính `SUM(delta) WHERE matured AND created_at <= cutoff` → ghi snapshot bất biến + ghi ledger `payout_debit` (âm) khóa điểm ngay (chống double-spend). Snapshot `status='paid'` thì chặn UPDATE.
- Vì ledger append-only + lưu `ledger_cutoff_ts`: takedown phát hiện muộn rơi vào kỳ sau, không sửa lùi kỳ đã trả.
- **Bốn mắt:** người duyệt payout (role `finance`/admin cấp 2) phải KHÁC người tạo snapshot và khác người gỡ tin.

### 5.4. Khiếu nại

- Bảng `point_appeals(id, ledger_id, user_id, reason, status('open','accepted','rejected'), resolver_id, resolver_note, resolved_at)`.
- Edge `submit-appeal` cho user mở khiếu nại trên 1 dòng ledger âm. Admin accept → ghi ledger `appeal_refund` (+ đúng số đã trừ) + giảm strike. Mọi hoàn điểm là dòng mới, không sửa dòng cũ.
- UI `MyContribution.tsx`: thêm tab "Lịch sử điểm" hiển thị từng giao dịch (delta, lý do tiếng Việt, tin liên quan, running balance, điểm khả dụng vs đã quy đổi) + nút "Khiếu nại".

### 5.5. Đối soát định kỳ + audit insider

- Cron hằng ngày so `SUM(ledger.delta) GROUP BY user_id` với cache `redeemable_balance`; lệch → Telegram alert (`_shared/telegram.ts`). Lệch = có sửa ngoài đường ledger.
- Mọi thay đổi tay chỉ qua RPC `admin_adjust_points(target, delta, note)` ghi `actor_id`. Nếu `actor_id == target` (admin tự cộng cho mình) → Telegram alert tức thì.

---

## 6. Lộ trình triển khai

### GIAI ĐOẠN 0 — Vá bảo mật (BẮT BUỘC, làm ngay, không liên quan tiền)
| # | Việc | Schema/file |
|---|------|-------------|
| 0.1 | **Vá RLS user tự sửa điểm** — tách `user_points` hoặc REVOKE UPDATE cột điểm | migration mới; sửa policy `20251021074441` |
| 0.2 | Chặn hard-delete tin user / ép soft-delete | trigger `BEFORE DELETE ON news`; cột `takedown_*` |

### GIAI ĐOẠN 1 — Nền tảng kế toán (MUST trước khi bật tiền)
| # | Việc | Schema/file |
|---|------|-------------|
| 1.1 | Tạo `points_ledger` append-only + trigger chặn UPDATE/DELETE | migration mới |
| 1.2 | Tách `lifetime_points` / `redeemable_balance`, bỏ floor 0 trên số dư khả dụng | `profiles` + trigger cache |
| 1.3 | Đổi 2 trigger hiện tại (`award_points_on_news`, `penalize_rejected_submission`) để INSERT ledger thay vì UPDATE total_points; thêm idempotency_key | `scoring_triggers.sql` |
| 1.4 | Backfill: ghi `admin_manual reason='migrate_from_total_points'` = total_points hiện tại cho mỗi user | migration mới |
| 1.5 | Trigger gỡ/DELETE thu hồi đủ award + giảm approved_count | trigger news |

### GIAI ĐOẠN 2 — Phạt phân tầng & escrow (MUST trước khi bật tiền)
| # | Việc | Schema/file |
|---|------|-------------|
| 2.1 | `takedown_reason` 4 bậc + `calc_takedown_penalty()` + tái phạm escalation | trigger + helper SQL |
| 2.2 | Strike/đình chỉ (`strike_count`, `submit_blocked_until`, `payout_suspended`) + decay cron + guard trong `submit-news` | `profiles`, `submit-news/index.ts` |
| 2.3 | Escrow: award `status='pending'` + `matured_at`; cron mature hằng ngày | ledger + cron |
| 2.4 | UI admin chọn lý do gỡ (RadioGroup + note) | `AdminContributions.tsx` |

### GIAI ĐOẠN 3 — Chống gian lận payout (MUST trước khi bật tiền)
| # | Việc | Schema/file |
|---|------|-------------|
| 3.1 | `kyc_verification` (national_id_hash UNIQUE, phone UNIQUE) | migration mới |
| 3.2 | `payout_config`, `payout_periods`, `payout_snapshots` + RPC chốt kỳ + payout_debit | migration mới |
| 3.3 | Edge `request-payout` (chặn nếu chưa KYC / chưa đủ ngưỡng / còn pending / frozen / suspended) | edge function mới |
| 3.4 | Bốn mắt: tách role `finance` duyệt payout | `user_roles` + RLS |

### GIAI ĐOẠN 4 — Chất lượng & chống đạo văn (SHOULD)
| # | Việc |
|---|------|
| 4.1 | `news_value` LLM + điểm biến thiên; sửa `isPlausible === true` |
| 4.2 | Chống đạo văn (fetch rawUrl + simhash body) + `rejected_plagiarism` |
| 4.3 | `event_cluster_id` chống chia nhỏ + trần tin được thưởng/ngày |
| 4.4 | `submission_log` thêm `ip_hash/device_hash`; cron flag Sybil; `fraud_flag` + `payout_frozen` |

### GIAI ĐOẠN 5 — Minh bạch & vận hành (SHOULD/NICE)
| # | Việc |
|---|------|
| 5.1 | Tab "Lịch sử điểm" + khiếu nại (`point_appeals`, edge `submit-appeal`) — SHOULD |
| 5.2 | Cron đối soát ledger vs cache + Telegram alert — SHOULD |
| 5.3 | Audit admin (`admin_adjust_points` RPC, alert tself-credit) + view "phạt theo admin" — SHOULD |
| 5.4 | Email confirm `config.toml` — SHOULD |
| 5.5 | Bonus engagement theo view thật (loại auto-views) — NICE |
| 5.6 | Hệ số độc quyền (exclusivity) — NICE |

---

## ⛔ Điều kiện BẮT BUỘC trước khi quy đổi tiền thật

Không được bật payout cho tới khi xong **Giai đoạn 0, 1, 2, 3**:

1. **Vá RLS user tự sửa điểm** (0.1) — nếu không, user tự nâng số dư = trộm tiền.
2. **Chặn DELETE né phạt** (0.2) — nếu không, xóa tin xấu vẫn giữ điểm = tiền.
3. **Ledger bất biến + tách hai loại điểm** (1.x) — không có sổ cái thì không kế toán/đối soát/khiếu nại được.
4. **Phạt phân tầng + escrow hold period** (2.x) — trả tiền trước khi hậu kiểm = moral hazard.
5. **KYC unique CCCD/SĐT + payout có duyệt tay + bốn mắt** (3.x) — không có thì sockpuppet farm rút tiền tự do và insider tự cộng điểm.

Các Giai đoạn 4–5 nâng cao công bằng/chất lượng và có thể làm song song hoặc sau khi đã chạy payout thận trọng (tỷ lệ rẻ, ngưỡng cao) ở quy mô nhỏ.