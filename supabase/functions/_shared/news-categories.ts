// Taxonomy 9 mục cho tin do USER gửi + bộ quy tắc phân loại (theo tài liệu sếp
// "Bộ mô tả phân loại thông tin"). Dùng chung cho edge submit-news / submit-news-bulk
// (prompt LLM) và frontend (nhãn). Slug khớp enum news_category.

export const SUBMISSION_CATEGORIES = [
  { slug: "kinh-te-dau-tu", label: "Kinh tế - Đầu tư" },
  { slug: "chung-khoan", label: "Chứng khoán" },
  { slug: "chinh-sach-phap-luat", label: "Chính sách - Pháp luật" },
  { slug: "xa-hoi-van-hoa", label: "Văn hóa - Xã hội" },
  { slug: "an-ninh-trat-tu", label: "An ninh - Trật tự" },
  { slug: "the-gioi", label: "Thế giới toàn cảnh" },
  { slug: "khoa-hoc-cong-nghe", label: "Khoa học - Công nghệ" },
  { slug: "the-thao", label: "Thể thao" },
  { slug: "nang-luong-ha-tang", label: "Năng lượng - Cơ sở hạ tầng" },
] as const;

export type SubmissionCategorySlug = (typeof SUBMISSION_CATEGORIES)[number]["slug"];

export const SUBMISSION_CATEGORY_SLUGS: SubmissionCategorySlug[] =
  SUBMISSION_CATEGORIES.map((c) => c.slug);

export function isValidCategory(slug: string): slug is SubmissionCategorySlug {
  return SUBMISSION_CATEGORY_SLUGS.includes(slug as SubmissionCategorySlug);
}

// Bộ quy tắc phân loại đầy đủ — nhúng vào system prompt của LLM.
export const CATEGORY_RULES = `Phân loại tin vào ĐÚNG MỘT trong 9 mục sau (trả về slug). Chọn theo TRỌNG TÂM chính của tin (tin này chủ yếu nói về điều gì?), KHÔNG máy móc theo từ khóa; từ khóa chỉ là tín hiệu hỗ trợ.

THỨ TỰ ƯU TIÊN khi tin giao thoa (kiểm lần lượt, chọn mục KHỚP ĐẦU TIÊN):
1) an-ninh-trat-tu → 2) chinh-sach-phap-luat → 3) chung-khoan → 4) nang-luong-ha-tang → 5) kinh-te-dau-tu → 6) khoa-hoc-cong-nghe → 7) the-thao → 8) xa-hoi-van-hoa → 9) the-gioi.

1. "kinh-te-dau-tu" — KINH TẾ - ĐẦU TƯ
Trọng tâm là hoạt động kinh doanh/thị trường (NGOÀI chứng khoán): doanh nghiệp mở rộng sản xuất, khởi công/vận hành dự án đầu tư, kết quả kinh doanh, doanh thu, lợi nhuận, M&A, gọi vốn, thương mại, logistics, xuất nhập khẩu, FDI; thị trường hàng hóa, bán lẻ, bất động sản, vàng, xăng dầu, lãi suất, tỷ giá, tín dụng, ngân hàng, bảo hiểm theo góc thị trường/kinh doanh; doanh nghiệp Việt đầu tư ra nước ngoài. Ví dụ: "Doanh nghiệp mở nhà máy tại Bình Dương tăng công suất xuất khẩu", "Giá vàng trong nước giảm sau biến động lãi suất". KHÔNG chọn nếu trọng tâm là cổ phiếu/trái phiếu/giao dịch (→ chung-khoan), là quy định (→ chinh-sach-phap-luat), là dự án điện/hạ tầng lớn (→ nang-luong-ha-tang).

2. "chung-khoan" — CHỨNG KHOÁN
Trọng tâm là thị trường vốn/chứng khoán: VN-Index, HNX-Index, UPCoM, nhóm ngành cổ phiếu, thanh khoản, dòng tiền, khối ngoại, tự doanh, phái sinh; giá cổ phiếu tăng trần/giảm sàn, vốn hóa, định giá, khuyến nghị; thông tin doanh nghiệp NIÊM YẾT: phát hành cổ phiếu, cổ tức, mua cổ phiếu quỹ, giao dịch cổ đông lớn/nội bộ; trái phiếu doanh nghiệp (phát hành/đáo hạn/mua lại) ở góc thị trường vốn; công ty chứng khoán, quỹ, ETF, margin; chỉ số/cổ phiếu quốc tế nếu bài thuần thị trường vốn. Ví dụ: "VN-Index mất mốc 1.300 điểm, thanh khoản tăng vọt", "Khối ngoại bán ròng nhóm ngân hàng", "DN niêm yết phát hành thêm cổ phiếu để tăng vốn". KHÔNG chọn nếu trọng tâm là hoạt động kinh doanh thực (→ kinh-te-dau-tu), là quy định (→ chinh-sach-phap-luat), hay vụ thao túng/lừa đảo bị điều tra (→ an-ninh-trat-tu).

3. "chinh-sach-phap-luat" — CHÍNH SÁCH - PHÁP LUẬT
Trọng tâm là quy định/chính sách/thủ tục/nghĩa vụ pháp lý: luật, nghị định, thông tư, quyết định, dự thảo, thủ tục hành chính, cấp phép, điều kiện kinh doanh; thuế, hóa đơn, phí, hải quan, bảo hiểm, lao động, đất đai, xây dựng, môi trường, dữ liệu cá nhân, chứng khoán, ngân hàng khi nội dung chính là QUY ĐỊNH MỚI/NGHĨA VỤ; xử phạt hành chính khi trọng tâm là mức phạt/căn cứ/nghĩa vụ (chưa thành vụ tố tụng). Ví dụ: "Từ 1/7 sàn TMĐT phải khấu trừ thuế thay người bán", "Quy định mới siết điều kiện phát hành trái phiếu riêng lẻ". PHÂN BIỆT: bài trả lời "quy định yêu cầu AI PHẢI LÀM GÌ" → mục này; "thị trường/DN BIẾN ĐỘNG ra sao" → kinh-te-dau-tu/chung-khoan.

4. "xa-hoi-van-hoa" — VĂN HÓA - XÃ HỘI
Trọng tâm là đời sống/dân sinh: giáo dục, tuyển sinh, trường học, học phí; y tế, bệnh viện, sức khỏe cộng đồng, cảnh báo dịch bệnh; an sinh, đô thị, môi trường, thời tiết, thiên tai, giao thông đô thị ở góc sinh hoạt; văn hóa, nghệ thuật, giải trí, lễ hội, di tích, du lịch, cộng đồng, câu chuyện con người; sự cố dân sinh CHƯA có yếu tố điều tra/tố tụng. Ví dụ: "Trường ĐH công bố phương án tuyển sinh", "Bộ Y tế cảnh báo dịch bệnh mùa hè", "Di tích được công nhận cấp quốc gia". KHÔNG chọn nếu là quy định (→ chinh-sach-phap-luat), có điều tra/xử lý (→ an-ninh-trat-tu), dự án hạ tầng lớn (→ nang-luong-ha-tang), hoặc thể thao (→ the-thao).

5. "an-ninh-trat-tu" — AN NINH - TRẬT TỰ
Trọng tâm là hành vi vi phạm được cơ quan chức năng điều tra/xử lý: điều tra, bắt giữ, khởi tố, truy tố, xét xử, truy nã, thi hành án, triệt phá đường dây; lừa đảo, trộm cắp, buôn lậu, ma túy, đánh bạc/cá độ trái phép, hàng giả, gian lận; tai nạn/cháy nổ nếu bài nhấn vào điều tra nguyên nhân/trách nhiệm/dấu hiệu vi phạm; cảnh báo thủ đoạn lừa đảo/chiếm đoạt tài sản. Ví dụ: "Công an triệt phá đường dây lừa đảo qua mạng", "Lãnh đạo công ty bị khởi tố vì thao túng cổ phiếu". ƯU TIÊN cao nhất: vụ việc DN/chứng khoán/bất động sản nếu trọng tâm là HÀNH VI VI PHẠM bị điều tra/xử lý → xếp vào đây (không vào kinh-te/chung-khoan). KHÔNG khẳng định tội danh khi nguồn chỉ nói "nghi vấn/đang xác minh".

6. "the-gioi" — THẾ GIỚI TOÀN CẢNH
Trọng tâm có chủ thể, địa điểm và tác động chính NGOÀI Việt Nam: chính trị quốc tế, bầu cử, ngoại giao, xung đột, an ninh khu vực; thiên tai, dịch bệnh, khủng hoảng ở nước ngoài; kinh tế toàn cầu, chính sách tiền tệ/thương mại quốc tế, doanh nghiệp nước ngoài (khi không có chủ thể Việt trực tiếp). Ví dụ: "Một nước châu Âu tổ chức bầu cử quốc hội", "Xung đột Trung Đông leo thang". NGOẠI LỆ (KHÔNG chọn Thế giới): thể thao quốc tế → the-thao; chỉ số/cổ phiếu quốc tế thuần → chung-khoan; DN Việt/hàng Việt chịu tác động trực tiếp → kinh-te-dau-tu; công nghệ có ứng dụng/tác động trực tiếp tới VN → khoa-hoc-cong-nghe.

7. "khoa-hoc-cong-nghe" — KHOA HỌC - CÔNG NGHỆ
Trọng tâm là nghiên cứu/đổi mới/công nghệ liên quan Việt Nam, DN Việt hoặc người dùng Việt: nghiên cứu khoa học, công bố học thuật; AI, dữ liệu, bán dẫn, điện toán đám mây, viễn thông, 5G/6G, blockchain, chuyển đổi số, hạ tầng số, nền tảng số; sản phẩm/ứng dụng công nghệ do DN Việt phát triển/triển khai; an ninh mạng ở góc giải pháp/lỗ hổng/công nghệ phòng vệ; công nghệ y tế/môi trường/năng lượng mới ở góc phát minh/thử nghiệm. Ví dụ: "DN Việt ra mắt nền tảng AI chăm sóc khách hàng", "Việt Nam thử nghiệm AI chẩn đoán bệnh", "Trường ĐH công bố nghiên cứu pin thế hệ mới". KHÔNG chọn nếu là quy định về dữ liệu/AI (→ chinh-sach-phap-luat), là thương vụ/gọi vốn/doanh thu (→ kinh-te-dau-tu), là cổ phiếu công nghệ (→ chung-khoan), hoặc lừa đảo/tấn công mạng có điều tra (→ an-ninh-trat-tu).

8. "the-thao" — THỂ THAO
Trọng tâm là thi đấu/thành tích thể thao (trong nước & quốc tế): bóng đá VN/quốc tế, V.League, đội tuyển, câu lạc bộ, cầu thủ, HLV, chuyển nhượng theo góc chuyên môn; các giải SEA Games, ASIAD, Olympic, World Cup, Euro, Champions League, AFF Cup...; kết quả trận đấu, lịch thi đấu, bảng xếp hạng, phong độ, chấn thương, huy chương. Ví dụ: "Đội tuyển Việt Nam công bố danh sách dự AFF Cup", "Lịch thi đấu vòng bảng Champions League". LƯU Ý: sự kiện thể thao dù ở nước ngoài vẫn xếp the-thao (không xếp the-gioi). KHÔNG chọn nếu trọng tâm là kinh doanh/bản quyền (→ kinh-te-dau-tu), quy định quản lý thể thao (→ chinh-sach-phap-luat), dàn xếp tỷ số/gian lận bị điều tra (→ an-ninh-trat-tu).

9. "nang-luong-ha-tang" — NĂNG LƯỢNG - CƠ SỞ HẠ TẦNG
Trọng tâm là dự án/hệ thống năng lượng & hạ tầng vật chất lớn: điện lực, quy hoạch điện, nguồn/lưới/truyền tải điện, thủy điện, nhiệt điện, điện gió, điện mặt trời, LNG, dầu khí, an ninh năng lượng; cao tốc, quốc lộ, cầu, hầm, cảng biển, sân bay, đường sắt, metro, khu công nghiệp/kinh tế; hạ tầng đô thị (cấp/thoát nước, xử lý rác/nước thải, chống ngập) ở góc công trình/hệ thống; khởi công, vận hành, tiến độ, tổng mức đầu tư, giải phóng mặt bằng, kết nối vùng; sự cố thiếu điện/tắc nghẽn hạ tầng ở góc năng lực hệ thống. Ví dụ: "Cao tốc Bắc - Nam đoạn mới chuẩn bị thông xe", "Dự án điện gió ngoài khơi hoàn tất khảo sát", "Sân bay mới điều chỉnh tổng mức đầu tư". KHÔNG chọn nếu trọng tâm là giá xăng/điện ở góc thị trường (→ kinh-te-dau-tu), quy định/đấu thầu/PPP (→ chinh-sach-phap-luat), cổ phiếu DN năng lượng (→ chung-khoan), công nghệ pin/hydro ở góc nghiên cứu (→ khoa-hoc-cong-nghe), hay sự cố có điều tra/xử lý trách nhiệm (→ an-ninh-trat-tu).`;
