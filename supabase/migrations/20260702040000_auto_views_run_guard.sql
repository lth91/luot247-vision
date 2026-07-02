-- Chống daily-auto-views bị GỌI TRÙNG trong cùng interval 30 phút (phát hiện
-- 02/07: mỗi mốc :00/:30 có 2 execution song song → view/ngày phồng ~1.7x lên
-- 5.1k). Bảng guard: mỗi interval chỉ INSERT được 1 dòng (PK) — lần gọi thứ 2
-- dính unique violation → function bỏ qua, không bơm view đúp.
-- Không policy RLS → chỉ service_role (edge function) đọc/ghi được.

CREATE TABLE IF NOT EXISTS public.auto_views_runs (
  interval_start timestamptz PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.auto_views_runs ENABLE ROW LEVEL SECURITY;
