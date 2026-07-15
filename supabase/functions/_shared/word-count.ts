// Bộ đếm từ chuẩn luot247 v2 (16/07) — khớp trực giác con người/MS Word.
// DÙNG CHUNG cho submit-news / submit-news-bulk / crawl-news; frontend mirror
// tại src/lib/newsCategories.ts; SQL mirror tại public.count_words. SỬA Ở ĐÂU
// PHẢI SỬA ĐỦ 3 NƠI — form và server lệch nhau 1 từ là nhân viên kêu ngay.
//
// Luật:
// 1) Gạch ngang DÀI –/— là dấu câu → thay bằng khoảng trắng:
//    "3.000–4.000" = 2 từ; "Đà Nẵng – Hội An" = 4 từ (không đếm dấu gạch).
// 2) Token thuần dấu câu/ký hiệu ("-", "...", "•") không phải từ.
// 3) Gạch nối NGẮN giữa chữ giữ nguyên: "COVID-19" = 1 từ.
export function countWords(s: string): number {
  return s
    .replace(/[–—]/g, " ")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0 && !/^[\p{P}\p{S}]+$/u.test(t))
    .length;
}

// Số KHỔ = số đoạn cách nhau bởi DÒNG TRỐNG (≥1 dòng trắng). "A\n\nB" = 2 khổ.
// Tin AI viết 1 khổ; tin nhân viên gõ tay bắt buộc ≥2 khổ (sếp 16/07).
export function paragraphCount(s: string): number {
  return s.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).length;
}

// Tự chia nội dung thành ĐÚNG 2 KHỔ (cho luồng import Sheet — nhân viên viết
// liền 1 đoạn, máy tách hộ). Đã có ≥2 khổ sẵn → giữ nguyên. Cắt tại ranh giới
// CÂU gần giữa nhất; không đổi số từ. Chỉ 1 câu → trả 1 khổ (hiếm ở 110+ từ).
export function splitIntoTwoParagraphs(content: string): string {
  const flat = content.trim();
  if (paragraphCount(flat) >= 2) return flat;
  const oneLine = flat.replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim();
  const sentences = oneLine.split(/(?<=[.!?…])\s+/).filter(Boolean);
  if (sentences.length < 2) return oneLine;
  const totalW = countWords(oneLine);
  let acc = 0, cut = 0;
  for (let i = 0; i < sentences.length - 1; i++) {
    acc += countWords(sentences[i]);
    cut = i;
    if (acc >= totalW / 2) break;
  }
  return sentences.slice(0, cut + 1).join(" ") + "\n\n" + sentences.slice(cut + 1).join(" ");
}
