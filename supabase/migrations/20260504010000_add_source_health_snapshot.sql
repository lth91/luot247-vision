-- Phase C — Per-source health monitoring + Telegram alert events.
-- 2 table:
--  - source_health_snapshot: state per source mỗi 4h (state hiện tại + articles_24h)
--  - source_event_log: state change events (disabled, recovered, added, failing) — log
--    dùng cho Telegram alert real-time + daily report Events 24h section
--
-- Health-check edge function mỗi 4h:
--  1. Snapshot current state vào source_health_snapshot
--  2. Compare với snapshot 4h trước → detect events
--  3. Insert events vào source_event_log
--  4. Append events list vào Telegram alert message

CREATE TABLE IF NOT EXISTS public.source_health_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.electricity_sources(id) ON DELETE CASCADE,
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL,
  consecutive_failures int NOT NULL DEFAULT 0,
  articles_24h int NOT NULL DEFAULT 0,
  last_error text
);

CREATE INDEX IF NOT EXISTS idx_source_health_snapshot_source_at
  ON public.source_health_snapshot (source_id, snapshot_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_health_snapshot_at
  ON public.source_health_snapshot (snapshot_at DESC);

ALTER TABLE public.source_health_snapshot ENABLE ROW LEVEL SECURITY;
-- No policy — only service_role (bypass) đọc/ghi.

CREATE TABLE IF NOT EXISTS public.source_event_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.electricity_sources(id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (event_type IN ('added','disabled','recovered','failing','fail_recovered','quiet')),
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_source_event_log_at
  ON public.source_event_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_event_log_source
  ON public.source_event_log (source_id, created_at DESC);

ALTER TABLE public.source_event_log ENABLE ROW LEVEL SECURITY;
-- No policy — only service_role.

COMMENT ON TABLE public.source_health_snapshot IS
  'Snapshot của electricity_sources state mỗi 4h. Dùng để diff phát hiện events.';
COMMENT ON TABLE public.source_event_log IS
  'Log state change events từ health-check diff. Dùng cho Telegram alert + daily report.';
