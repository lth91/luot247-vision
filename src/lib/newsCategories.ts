// Taxonomy 5 mục cho tin do user gửi — mirror của
// supabase/functions/_shared/news-categories.ts (frontend dùng cho Select + hiển thị nhãn).
// Slug khớp enum news_category (migration 20260629010000).

export const SUBMISSION_CATEGORIES = [
  { slug: "kinh-te-dau-tu", label: "KINH TẾ - ĐẦU TƯ" },
  { slug: "chung-khoan", label: "CHỨNG KHOÁN" },
  { slug: "chinh-sach-phap-luat", label: "CHÍNH SÁCH - PHÁP LUẬT" },
  { slug: "xa-hoi-van-hoa", label: "VĂN HÓA - XÃ HỘI" },
  { slug: "an-ninh-trat-tu", label: "AN NINH - TRẬT TỰ" },
  { slug: "the-gioi", label: "THẾ GIỚI TOÀN CẢNH" },
  { slug: "khoa-hoc-cong-nghe", label: "KHOA HỌC - CÔNG NGHỆ" },
  { slug: "the-thao", label: "THỂ THAO" },
  { slug: "nang-luong-ha-tang", label: "NĂNG LƯỢNG - CƠ SỞ HẠ TẦNG" },
] as const;

export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  SUBMISSION_CATEGORIES.map((c) => [c.slug, c.label]),
);

export function categoryLabel(slug: string | null | undefined): string {
  if (!slug) return "—";
  return CATEGORY_LABEL[slug] ?? slug;
}

// Đếm từ (khớp logic edge function) cho word-count live trên form.
// v2 (16/07) — khớp trực giác con người/Word, mirror của _shared/word-count.ts:
// gạch dài –/— là dấu câu ("3.000–4.000" = 2 từ, "Đà Nẵng – Hội An" không đếm
// dấu gạch); token thuần dấu câu không phải từ; gạch nối ngắn giữ (COVID-19 = 1 từ).
// Số KHỔ = đoạn cách nhau DÒNG TRỐNG (mirror _shared/word-count.ts).
export function paragraphCount(s: string): number {
  return s.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).length;
}

export function countWords(s: string): number {
  return s
    .replace(/[–—]/g, " ")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0 && !/^[\p{P}\p{S}]+$/u.test(t))
    .length;
}

// Chốt với đội 03/07 (bản cuối): tiêu đề 12–18, TỔNG cả tin 120–140 (đúng
// nguyên văn "Bộ tiêu chí lọc tin"). Form tự tính khoảng nội dung theo tiêu
// đề (= totalMin-title .. totalMax-title) nên nhân viên không phải cộng tổng.
export const SUBMISSION_LIMITS = {
  titleMin: 12,
  titleMax: 18,
  totalMin: 120,
  totalMax: 140,
} as const;
