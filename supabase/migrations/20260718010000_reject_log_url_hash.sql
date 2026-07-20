-- Bước 0.1 (18/07): chống tái xử lý bài đã bị AI loại. Trước đây bài bị loại
-- ở kiểm-sớm/viết/giám-khảo chỉ ghi crawl_reject_log, KHÔNG có url_hash trong
-- news → lượt quét sau bài vẫn nằm trên feed, lại bị fetch + tốn 2-3 cú LLM
-- + loại lại, lặp đến khi bài quá 3 ngày tuổi. Vá: lưu url_hash vào hồ sơ
-- loại, crawler kiểm nó ở dedup lớp 1 → mỗi bài chỉ tốn LLM đúng 1 lần đời.

ALTER TABLE public.crawl_reject_log ADD COLUMN IF NOT EXISTS url_hash text;
CREATE INDEX IF NOT EXISTS idx_crawl_reject_log_url_hash
  ON public.crawl_reject_log (url_hash) WHERE url_hash IS NOT NULL;

-- Truy hồi cho hồ sơ đã có (url lưu dạng canonical, digest sha256 hex khớp
-- đúng sha256Hex của edge function) → tiết kiệm ngay với ~800 bài đã loại
-- còn đang nằm trên feed.
UPDATE public.crawl_reject_log
SET url_hash = encode(extensions.digest(url, 'sha256'), 'hex')
WHERE url IS NOT NULL AND url_hash IS NULL;

-- Hồ sơ loại chỉ cần cho tra cứu + chống tái xử lý (bài >3 ngày crawler tự bỏ)
-- → dọn bản ghi quá 30 ngày mỗi đêm 02:20 VN (19:20 UTC).
SELECT cron.schedule(
  'crawl-reject-log-purge',
  '20 19 * * *',
  $$DELETE FROM public.crawl_reject_log WHERE created_at < now() - interval '30 days'$$
);
