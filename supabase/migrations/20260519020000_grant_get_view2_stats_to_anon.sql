-- Fix /viewcount hiển thị tất cả 0:
-- get_view2_stats() chỉ có EXECUTE cho service_role + postgres.
-- Frontend ViewCount2.tsx gọi supabase.rpc('get_view2_stats') bằng
-- publishable (anon) key → permission denied → catch error, state mặc
-- định {yesterday:0, today:0, ...} → UI hiển thị 0.
--
-- Function SECURITY DEFINER, chỉ trả 5 số tổng hợp (yesterday, today,
-- this_week, this_month, total). Không leak row-level PII → an toàn
-- grant cho anon + authenticated.

GRANT EXECUTE ON FUNCTION public.get_view2_stats() TO anon, authenticated;
