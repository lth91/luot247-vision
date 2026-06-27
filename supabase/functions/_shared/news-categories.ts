// Taxonomy 5 mục cho tin do USER gửi + bộ quy tắc phân loại (user cung cấp).
// Dùng chung cho edge function submit-news (prompt LLM) và frontend (nhãn Select).
// Slug khớp enum news_category đã thêm ở migration 20260629010000.

export const SUBMISSION_CATEGORIES = [
  { slug: "kinh-te-dau-tu", label: "Kinh tế, đầu tư, kinh doanh" },
  { slug: "chinh-sach-phap-luat", label: "Chính sách, pháp luật kinh doanh" },
  { slug: "xa-hoi-van-hoa", label: "Xã hội, văn hóa, đời sống" },
  { slug: "an-ninh-trat-tu", label: "An ninh, trật tự" },
  { slug: "the-gioi", label: "Thế giới" },
] as const;

export type SubmissionCategorySlug = (typeof SUBMISSION_CATEGORIES)[number]["slug"];

export const SUBMISSION_CATEGORY_SLUGS: SubmissionCategorySlug[] =
  SUBMISSION_CATEGORIES.map((c) => c.slug);

export function isValidCategory(slug: string): slug is SubmissionCategorySlug {
  return SUBMISSION_CATEGORY_SLUGS.includes(slug as SubmissionCategorySlug);
}

// Bộ quy tắc phân loại đầy đủ — nhúng vào system prompt của LLM.
export const CATEGORY_RULES = `Phân loại tin vào ĐÚNG MỘT trong 5 mục sau (trả về slug):

1. "kinh-te-dau-tu" — KINH TẾ, ĐẦU TƯ, KINH DOANH
Tin có trọng tâm là hoạt động kinh tế, thị trường, doanh nghiệp, đầu tư, tài chính, ngân hàng, chứng khoán, bất động sản, sản xuất, thương mại, logistics, xuất nhập khẩu, giá hàng hóa, xăng dầu, vàng, tỷ giá, lãi suất, trái phiếu, cổ phiếu, kết quả kinh doanh, dự án đầu tư, M&A, mở rộng nhà máy, khởi công, vận hành, gọi vốn. Trọng tâm chính nằm ở hoạt động kinh doanh hoặc chuyển động thị trường, KHÔNG phải ở quy định pháp luật. Ví dụ: "PV Drilling phát hành cổ phiếu để tăng vốn", "Giá vàng giảm sau quyết định của Fed", "Doanh nghiệp đầu tư khu công nghiệp mới", "Sàn TMĐT tăng doanh thu quý II". Nếu tin nhắc tới văn bản pháp luật nhưng trọng tâm vẫn là doanh nghiệp làm gì / thị trường thay đổi ra sao / dự án nào triển khai / giá nào tăng giảm → vẫn xếp vào đây.

2. "chinh-sach-phap-luat" — CHÍNH SÁCH, PHÁP LUẬT KINH DOANH
Tin có trọng tâm là quy định pháp luật, chính sách, nghị định, thông tư, thủ tục hành chính, điều kiện kinh doanh, thuế, hóa đơn, phí, lệ phí, giấy phép, đất đai, xây dựng, lao động, bảo hiểm, môi trường, cạnh tranh, hải quan, chứng khoán, ngân hàng — khi nội dung chính là QUY ĐỊNH MỚI hoặc NGHĨA VỤ PHÁP LÝ của doanh nghiệp/hộ kinh doanh/nhà đầu tư. Ví dụ: "Từ 1/7 sàn TMĐT phải khấu trừ thuế thay người bán", "DN dưới 1 tỷ doanh thu được miễn thuế TNDN", "Điều chỉnh điều kiện cấp phép kinh doanh vàng". PHÂN BIỆT với mục 1: nếu tin trả lời "quy định mới yêu cầu AI PHẢI LÀM GÌ?" → mục này; nếu trả lời "doanh nghiệp/thị trường đang BIẾN ĐỘNG thế nào?" → mục 1.

3. "xa-hoi-van-hoa" — XÃ HỘI, VĂN HÓA, ĐỜI SỐNG
Tin về giáo dục, y tế, giao thông, môi trường, thời tiết, đô thị, dân sinh, an sinh xã hội, lao động đời sống, du lịch, văn hóa, thể thao, nghệ thuật, giải trí, cộng đồng, lễ hội, di tích, trường học, bệnh viện, chính sách xã hội — KHÔNG đặt trọng tâm vào doanh nghiệp. Ví dụ: sự cố cháy dân sinh chưa có yếu tố điều tra; trường ĐH công bố phương án tuyển sinh; Bộ Y tế cảnh báo dịch bệnh; di tích được công nhận; hạ tầng đô thị/đời sống người dân.

4. "an-ninh-trat-tu" — AN NINH, TRẬT TỰ
Tin về điều tra, bắt giữ, khởi tố, xét xử, truy nã, lừa đảo, trộm cắp, ma túy, buôn lậu, đánh bạc, vi phạm trật tự xã hội, tai nạn nghiêm trọng CÓ yếu tố điều tra, đường dây tội phạm — do công an/cơ quan tố tụng xử lý. Ví dụ: "phát hiện nhóm dùng tài khoản giả để lừa đảo", "công an triệt phá đường dây tiêu thụ xe gian", "bắt nhóm vận chuyển ma túy", "điều tra vụ cháy có dấu hiệu vi phạm". ƯU TIÊN: nếu vụ việc liên quan doanh nghiệp nhưng trọng tâm là HÀNH VI VI PHẠM / bắt giữ / điều tra / khởi tố → xếp vào đây, KHÔNG vào mục 1 (vd "Giám đốc công ty bị bắt vì lừa đảo trái phiếu"). Nhưng "DN bị xử phạt hành chính vì chậm công bố thông tin" → mục 2 hoặc 1 tùy góc.

5. "the-gioi" — THẾ GIỚI
Tin quốc tế có chủ thể, địa điểm và tác động chính Ở NGOÀI Việt Nam: chính trị quốc tế, xung đột, bầu cử, thiên tai, dịch bệnh, kinh tế toàn cầu, thị trường quốc tế, doanh nghiệp nước ngoài, công nghệ/thể thao/văn hóa quốc tế. MẶC ĐỊNH: nếu sự kiện xảy ra ở nước ngoài VÀ không có chủ thể Việt Nam trực tiếp → xếp vào đây. NGOẠI LỆ: tin về doanh nghiệp Việt đầu tư ra nước ngoài, hoặc chính sách nước ngoài tác động trực tiếp đến hàng hóa/DN Việt → xếp mục 1 hoặc 2 tùy trọng tâm (vd "DN Việt mở kho logistics tại Campuchia" → mục 1).`;
