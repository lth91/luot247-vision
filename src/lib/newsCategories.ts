// Taxonomy 5 mục cho tin do user gửi — mirror của
// supabase/functions/_shared/news-categories.ts (frontend dùng cho Select + hiển thị nhãn).
// Slug khớp enum news_category (migration 20260629010000).

export const SUBMISSION_CATEGORIES = [
  { slug: "kinh-te-dau-tu", label: "Kinh tế, đầu tư, kinh doanh" },
  { slug: "chinh-sach-phap-luat", label: "Chính sách, pháp luật kinh doanh" },
  { slug: "xa-hoi-van-hoa", label: "Xã hội, văn hóa, đời sống" },
  { slug: "an-ninh-trat-tu", label: "An ninh, trật tự" },
  { slug: "the-gioi", label: "Thế giới" },
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
