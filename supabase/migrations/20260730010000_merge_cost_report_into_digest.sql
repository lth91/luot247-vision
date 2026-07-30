-- Gộp báo cáo API cost 8h05 vào Bản tin sáng 8h00 (anh Long chốt 30/07 —
-- "nhìn cho tiện"). Bản tin sáng giờ hiển thị TỔNG chi tất cả function +
-- breakdown crawl/bulk/lẻ + so TB 7 ngày → tin 8h05 thừa, tắt cron.
-- GIỮ llm-cost-hourly-check (chó canh im lặng, chỉ kêu khi >$1/giờ) và
-- edge function api-cost-report (hourly-check vẫn dùng).

DO $$
BEGIN
  PERFORM cron.unschedule('llm-cost-daily-report');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
