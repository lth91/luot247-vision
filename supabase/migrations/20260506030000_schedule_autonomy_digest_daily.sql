-- Phase F — chuyển autonomy digest từ tuần (Chủ Nhật 02:00 UTC) sang hàng ngày.
-- User feedback: muốn báo cáo daily Telegram thay vì weekly để bám trạng thái.
-- Function vẫn dùng window rolling 7 ngày cho coverage/trend, nhưng emit hằng
-- ngày (rolling daily snapshot).

DO $$ BEGIN
  PERFORM cron.unschedule('weekly-autonomy-digest');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.unschedule('autonomy-digest-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'autonomy-digest-daily',
  '0 2 * * *',
  $$SELECT public.call_weekly_autonomy_digest();$$
);
