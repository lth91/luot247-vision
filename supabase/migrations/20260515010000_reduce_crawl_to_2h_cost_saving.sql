-- Cost-saving Option 1: giảm cron crawl-electricity-news từ hourly → 2h.
-- Lý do: API cost ~$3/ngày, 80% là crawl-electricity-news. Giảm tần suất 1/2
-- → tiết kiệm ~$1.15/ngày (-38% tổng) = ~$35/tháng.
-- Trade-off: latency catch bài tăng từ 1h → 2h. Báo VN publish 2-5 bài/ngày
-- nên coverage gần như không đổi.
-- Reversible: đổi schedule lại '0 * * * *'.

SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'crawl-electricity-news-hourly'),
  schedule := '0 */2 * * *'
);
