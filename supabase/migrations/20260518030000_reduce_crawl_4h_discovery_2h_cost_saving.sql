-- Cost-saving Option giữa (sau Option 1 commit 1af3a5a giảm crawl hourly→2h):
-- Audit 7 ngày 5/11-5/17 cho thấy:
--   crawl-electricity-news: ~$1.20/day (sau Option 1)
--   discovery-rss-news:classify: ~$0.56/day (cron 1h × 24)
--   discovery-rss-news:summarize: ~$0.06/day
--   Tổng: ~$1.82/day = ~$55/tháng
--
-- Option giữa: crawl 2h→4h + discovery 1h→2h
--   crawl runs/day: 12 → 6 (-50%) → tiết kiệm ~$0.6/day = $18/m
--   discovery runs/day: 24 → 12 (-50%) → tiết kiệm ~$0.31/day = $9.3/m
--   Tổng: $30/tháng (-45% từ baseline)
--
-- Trade-off:
--   - Latency catch bài: crawl 2h→4h (báo VN publish 2-5 bài/day, vẫn OK)
--   - Discovery: 1h→2h giảm 50% nhưng cap MAX_CANDIDATES=30 vẫn đủ
--     (current ~3 candidates/run × 24 = 72 candidates/day → 2h sẽ ~6/run, đủ headroom)
--   - Tin viral: chậm tối đa 2h (vẫn acceptable)
--
-- Reversible: đổi schedule lại '0 */2 * * *' + '30 * * * *'.

SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'crawl-electricity-news-hourly'),
  schedule := '0 */4 * * *'
);

SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'discovery-rss-news-hourly'),
  schedule := '30 */2 * * *'
);
