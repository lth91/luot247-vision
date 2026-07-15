-- Bộ đếm từ v2 (nhân viên báo lệch 16/07): khớp trực giác con người/MS Word.
-- Đồng bộ với countWords JS (form + 3 edge function):
--   1) Gạch ngang DÀI –/— là dấu câu → thay bằng khoảng trắng
--      ("3.000–4.000" = 2 từ; "Đà Nẵng – Hội An" không đếm dấu gạch).
--   2) Token thuần dấu câu ("-", "...", "•") không phải từ.
--   3) Gạch nối ngắn giữa chữ giữ nguyên (COVID-19 = 1 từ).
CREATE OR REPLACE FUNCTION public.count_words(_s text)
RETURNS int
LANGUAGE sql IMMUTABLE
AS $$
  SELECT count(*)::int
  FROM regexp_matches(translate(coalesce(_s, ''), '–—', '  '), '\S+', 'g') AS m
  WHERE m[1] !~ '^[[:punct:]…•]+$';
$$;
