-- RLS policies cho 2 audit table dashboard /ddashboard cần đọc:
-- - source_candidate_log (Phase E discovery audit)
-- - selector_fix_log (Phase G AI auto-fix audit)
--
-- Cả 2 enable RLS từ migration gốc (Phase E/G) nhưng không có SELECT
-- policy → frontend anon key trả 0 row. Dữ liệu là metadata pipeline
-- (domain candidates, AI fix attempts) — không sensitive, expose public
-- read OK để dashboard tab AI Agents hoạt động.

DROP POLICY IF EXISTS "public read source_candidate_log" ON public.source_candidate_log;
CREATE POLICY "public read source_candidate_log"
  ON public.source_candidate_log
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "public read selector_fix_log" ON public.selector_fix_log;
CREATE POLICY "public read selector_fix_log"
  ON public.selector_fix_log
  FOR SELECT
  USING (true);
