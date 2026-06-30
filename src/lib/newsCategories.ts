// Taxonomy 5 mục cho tin do user gửi — mirror của
// supabase/functions/_shared/news-categories.ts (frontend dùng cho Select + hiển thị nhãn).
// Slug khớp enum news_category (migration 20260629010000).

export const SUBMISSION_CATEGORIES = [
  { slug: "kinh-te-dau-tu", label: "KINH TẾ, ĐẦU TƯ, KINH DOANH" },
  { slug: "chinh-sach-phap-luat", label: "CHÍNH SÁCH, PHÁP LUẬT KINH DOANH" },
  { slug: "xa-hoi-van-hoa", label: "XÃ HỘI, VĂN HÓA, ĐỜI SỐNG" },
  { slug: "an-ninh-trat-tu", label: "AN NINH, TRẬT TỰ" },
  { slug: "the-gioi", label: "THẾ GIỚI" },
  { slug: "khoa-hoc-cong-nghe", label: "KHOA HỌC CÔNG NGHỆ" },
] as const;

export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  SUBMISSION_CATEGORIES.map((c) => [c.slug, c.label]),
);

export function categoryLabel(slug: string | null | undefined): string {
  if (!slug) return "—";
  return CATEGORY_LABEL[slug] ?? slug;
}

// Đếm từ (khớp logic edge function) cho word-count live trên form.
export function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

export const SUBMISSION_LIMITS = {
  titleMin: 10,
  titleMax: 18,
  contentMin: 110,
  contentMax: 140,
} as const;
