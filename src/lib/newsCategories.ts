// Taxonomy 5 mục cho tin do user gửi — mirror của
// supabase/functions/_shared/news-categories.ts (frontend dùng cho Select + hiển thị nhãn).
// Slug khớp enum news_category (migration 20260629010000).

export const SUBMISSION_CATEGORIES = [
  { slug: "kinh-te-dau-tu", label: "Đầu tư - Kinh doanh" },
  { slug: "chinh-sach-phap-luat", label: "Pháp luật" },
  { slug: "xa-hoi-van-hoa", label: "Văn hoá - Xã hội" },
  { slug: "an-ninh-trat-tu", label: "Hình sự" },
  { slug: "the-gioi", label: "Thế giới" },
  { slug: "khoa-hoc-cong-nghe", label: "Khoa học công nghệ" },
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
