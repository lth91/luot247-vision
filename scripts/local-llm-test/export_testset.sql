-- ============================================================
-- BƯỚC 0 — XUẤT BỘ TEST CHO LOCAL LLM (chạy trong Supabase SQL Editor)
-- Chạy TỪNG câu một, bấm Export → JSON, lưu đúng tên file:
--   Câu 1 → phanloai.json
--   Câu 2 → trung.json
-- Đặt 2 file cạnh run_test.py trên máy Mac.
-- ============================================================

-- ---------- CÂU 1: BỘ PHÂN LOẠI (150 tin nhân viên đã đăng 7 ngày) ----------
-- Đáp án = category Haiku đã chọn (tin đăng rồi nên coi như "sạch": local
-- model mà gắn cờ vi phạm là điểm trừ false-positive).
SELECT n.id,
       n.title,
       n.description AS content,
       n.category    AS haiku_category,
       COALESCE(n.ai_classification->>'is_ai_generated', 'false') AS haiku_aig,
       COALESCE(n.ai_classification->>'ai_confidence', '0')       AS haiku_ac
  FROM news n
 WHERE n.submitted_by IS NOT NULL
   AND n.created_at >= now() - interval '7 days'
 ORDER BY random()
 LIMIT 150;

-- ---------- CÂU 2: BỘ KIỂM TRÙNG (cặp tin nghi trùng đã có người phán) ----------
-- Đây là VÙNG XÁM: toàn ca Haiku đã cho qua (khac/dien_bien_moi), sau đó
-- NHÂN VIÊN quyết — staff_verdict là chuẩn vàng. Local model giỏi hơn Haiku
-- nếu khớp nhân viên nhiều hơn tỷ lệ 'khac' trong bộ.
WITH xet AS (
  SELECT DISTINCT ON (n.id)
         n.id, n.title, n.description,
         (n.ai_classification->>'similar_news_id')::uuid AS sim_id,
         (n.ai_classification->>'similar_sim')::real     AS sim_sim,
         (n.ai_classification->'new_development') IS NOT NULL
           AND jsonb_typeof(n.ai_classification->'new_development') <> 'null' AS haiku_dbm,
         r.action, r.reason
    FROM news n
    JOIN review_log r ON r.news_id = n.id
   WHERE n.submitted_by IS NULL
     AND n.ai_classification->>'similar_news_id' IS NOT NULL
   ORDER BY n.id, r.created_at DESC
)
SELECT x.id,
       x.title       AS tin_moi_title,
       x.description AS tin_moi_content,
       s.title       AS tin_cu_title,
       s.description AS tin_cu_content,
       round(x.sim_sim::numeric, 2) AS sim_he_thong,
       CASE WHEN x.haiku_dbm THEN 'dien_bien_moi' ELSE 'khac' END AS haiku_verdict,
       CASE WHEN x.action = 'reject' THEN 'trung' ELSE 'khac' END AS staff_verdict
  FROM xet x
  JOIN news s ON s.id = x.sim_id
 WHERE x.action <> 'reject'                        -- nhân viên duyệt đăng = khac
    OR x.reason LIKE 'Trùng tin đã có%'            -- loại VÌ TRÙNG = trung
    OR x.reason LIKE 'Lọc lượt 2%'                 -- pass-2 cũ chặn = trung
 ORDER BY random()
 LIMIT 200;
