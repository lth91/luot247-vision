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
export function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
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
