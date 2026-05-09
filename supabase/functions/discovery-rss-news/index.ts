// Discovery RSS: hút tin ngành điện/năng lượng VN từ RSS báo lớn, lọc bằng Claude Haiku, insert electricity_news.
// Bổ sung cho crawl-electricity-news (chạy song song), giúp tăng coverage mà không cần maintain selector mỗi báo.
//
// Flow: Fetch 15 RSS feed → dedupe vs DB → keyword pre-filter → LLM classify relevance → fetch bài pass →
// summarize bằng Claude Haiku → insert electricity_news (source_id = virtual "RSS Discovery").

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { logLlmUsage } from "../_shared/llm-usage.ts";
import { DOMParser, Element } from "https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts";
import { ELECTRICITY_KEYWORD_RE, isOperationalScheduleNoise } from "../_shared/electricity-keywords.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const FEED_FETCH_TIMEOUT_MS = 15000;
const ARTICLE_FETCH_TIMEOUT_MS = 20000;
const WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_CANDIDATES_PER_RUN = 30;        // Revert 60 → 30 (07/05 cost spike): cap thấp lại để giảm classify calls.
const MAX_INSERTS_PER_RUN = 15;           // Revert 25 → 15 song song
const MAX_CONTENT_CHARS = 8000;
const DISCOVERY_SOURCE_NAME = "RSS Discovery";
const MIN_CLASSIFY_CONFIDENCE = 0.85;     // Revert 0.75 → 0.85 (07/05 cost spike): auto-reload Anthropic 3x/36h. Threshold cao hơn = ít summarize calls.
                                          // 0.7-0.85 hay miss off-topic (vd "Triều Tiên hạt nhân", lifestyle có "tiết kiệm điện").
                                          // Trade-off: giảm recall ~10-15%, tăng precision rõ rệt.

const FEEDS: { name: string; url: string }[] = [
  { name: "VnExpress - Kinh doanh",   url: "https://vnexpress.net/rss/kinh-doanh.rss" },
  { name: "VnExpress - Tin mới",      url: "https://vnexpress.net/rss/tin-moi-nhat.rss" },
  { name: "VnExpress - Khoa học",     url: "https://vnexpress.net/rss/khoa-hoc.rss" },
  { name: "Tuổi Trẻ - Kinh doanh",    url: "https://tuoitre.vn/rss/kinh-doanh.rss" },
  { name: "Tuổi Trẻ - Thời sự",       url: "https://tuoitre.vn/rss/thoi-su.rss" },
  { name: "Tuổi Trẻ - Thế giới",      url: "https://tuoitre.vn/rss/the-gioi.rss" },
  { name: "BaoTinTuc - Tin mới",      url: "https://baotintuc.vn/tin-moi-nhat.rss" },
  { name: "BaoTinTuc - Thế giới",     url: "https://baotintuc.vn/the-gioi.rss" },
  // Combo feeds removed 07/05 (cost spike): VietnamBiz, Bnews x2,
  // Môi Trường x2, NLĐ Kinh tế. Giữ 5 feed mới (Tuổi Trẻ Thế giới +
  // BaoTinTuc x2 + VnEconomy Khoa học) đã proven catch bài.
  { name: "Thanh Niên - Kinh tế",     url: "https://thanhnien.vn/rss/kinh-te.rss" },
  { name: "CafeF - Doanh nghiệp",     url: "https://cafef.vn/doanh-nghiep.rss" },
  { name: "CafeF - Chứng khoán",      url: "https://cafef.vn/thi-truong-chung-khoan.rss" },
  { name: "Dân Trí - Kinh doanh",     url: "https://dantri.com.vn/rss/kinh-doanh.rss" },
  { name: "Dân Trí - Sự kiện",        url: "https://dantri.com.vn/rss/su-kien.rss" },
  { name: "VnEconomy - Kinh tế",      url: "https://vneconomy.vn/kinh-te.rss" },
  { name: "VnEconomy - Tài chính",    url: "https://vneconomy.vn/tai-chinh.rss" },
  { name: "VnEconomy - Đầu tư",       url: "https://vneconomy.vn/dau-tu.rss" },
  { name: "VnEconomy - Khoa học",     url: "https://vneconomy.vn/khoa-hoc.rss" },
  { name: "VOV - Kinh tế",            url: "https://vov.vn/rss/kinh-te.rss" },
  { name: "VTC News - Kinh tế",       url: "https://vtcnews.vn/rss/kinh-te.rss" },
  { name: "Nhân Dân - Kinh tế",       url: "https://nhandan.vn/rss/kinhte.rss" },
  { name: "Nhân Dân - Khoa học",      url: "https://nhandan.vn/rss/khoahoc.rss" },
  { name: "VietnamPlus - Kinh tế",    url: "https://www.vietnamplus.vn/rss/kinhte.rss" },
  { name: "VietnamNet - Kinh doanh",  url: "https://vietnamnet.vn/rss/kinh-doanh.rss" },
  { name: "VietnamNet - Thời sự",     url: "https://vietnamnet.vn/rss/thoi-su.rss" },
  { name: "PECC3",                    url: "https://www.pecc3.com.vn/feed" },
  { name: "Báo Đấu Thầu - Năng lượng",url: "https://baodauthau.vn/rss/nang-luong.rss" },
  // Phase B1 (audit 03/05): Báo Chính Phủ + SGGP — RSS 50 items/feed, fresh today.
  // Cả hai cần classifier filter mạnh vì general news, không electricity-specific.
  // Phase 1 classifier (threshold 0.85 + blacklist) handle false positive.
  { name: "Báo Chính Phủ",            url: "https://baochinhphu.vn/rss" },
  { name: "SGGP - Kinh tế",           url: "https://www.sggp.org.vn/rss/kinh-te-3.rss" },
  // Phase F2 (audit 08/05 nhân viên): bài E#11, 16, 18, 19 từ nguồn chưa có
  { name: "BNews - Kinh tế VN",       url: "https://bnews.vn/rss/kinh-te-viet-nam-1.rss" },
  { name: "BNews - Kinh tế Thế giới", url: "https://bnews.vn/rss/kinh-te-the-gioi-2.rss" },
  { name: "BNews - Doanh nghiệp",     url: "https://bnews.vn/rss/doanh-nghiep-6.rss" },
  { name: "Thời báo Tài chính VN",    url: "https://thoibaotaichinhvietnam.vn/rss_feed/" },
  { name: "Người Đưa Tin - Kinh tế",  url: "https://www.nguoiduatin.vn/rss/kinh-te.rss" },
  { name: "Người Đưa Tin - Công nghệ",url: "https://www.nguoiduatin.vn/rss/cong-nghe.rss" },
];

// HTML list-page feeds: các site không có RSS. Mỗi feed có listUrl (trang section)
// và linkPattern (regex match pathname của bài detail). Pipeline sẽ extract link,
// đưa qua cùng keyword + LLM filter như RSS.
const HTML_FEEDS: { name: string; listUrl: string; linkPattern: string }[] = [
  { name: "Hà Nội Mới - Kinh tế",       listUrl: "https://hanoimoi.vn/kinh-te",             linkPattern: "^/[a-z0-9-]{20,}-\\d{5,}\\.html$" },
  { name: "Bộ Công Thương - Tin tức",   listUrl: "https://moit.gov.vn/tin-tuc/hoat-dong",   linkPattern: "^/tin-tuc/.*[a-z-]{20,}\\.html$" },
  { name: "PetroVietnam",               listUrl: "https://petrovietnam.petrotimes.vn/",     linkPattern: "^/[a-z0-9-]{20,}-\\d{5,}\\.html$" },
  { name: "Người Quan Sát",             listUrl: "https://nguoiquansat.vn/tin-moi-nhat",    linkPattern: "^/[a-z0-9-]{20,}-\\d{5,}\\.html$" },
  { name: "Doanh nghiệp VN",            listUrl: "https://doanhnghiepvn.vn/948/tin-tuc",    linkPattern: "^/tin-tuc/[^/]+/\\d{14}$" },
  { name: "VTV8",                       listUrl: "https://vtv8.vtv.vn/",                    linkPattern: "^/[a-z0-9-]{20,}-\\d{15,}\\.htm$" },
  // Mekong ASEAN HTML feed removed 07/05 (cost spike combo revert)
];

// Keyword pre-filter: loại ~94% bài không liên quan trước khi gọi LLM.
// Imported từ _shared để dùng chung với crawl-electricity-news.
const KEYWORD_RE = ELECTRICITY_KEYWORD_RE;

// Title blacklist: pattern rõ ràng off-topic dù đã pass KEYWORD_RE qua description.
// Chạy trước LLM để tiết kiệm cost + bắt được case LLM borderline confidence.
// Nếu title có signal mạnh về electricity (STRONG_ELEC_RE), KHÔNG reject — để LLM xử lý.
// Unicode-aware boundaries (giải thích trong electricity-keywords.ts).
const STRONG_ELEC_RE = /(?<![\p{L}\p{N}_])(EVN|BESS|PPA|DPPA|điện\s*lực|điện\s*gió|điện\s*mặt\s*trời|điện\s*hạt\s*nhân|thủy\s*điện|nhiệt\s*điện|lưới\s*điện|cung\s*ứng\s*điện|giá\s*điện|Cục\s*Điện\s*lực|Quy\s*hoạch\s*điện|Bộ\s*Công\s*Thương|LNG|điện\s*sinh\s*khối|điện\s*khí)(?![\p{L}\p{N}_])/iu;

const BLACKLIST_PATTERNS: Array<{ name: string; re: RegExp }> = [
  // Digest title trộn 2+ chủ đề bằng ; hoặc | — luôn loãng dù 1 phần là điện
  { name: "digest_mix", re: /[;|]\s*(tăng\s+lương|lương\s+hưu|BĐS|bất\s+động\s+sản|y\s+tế|giáo\s+dục|tỷ\s+giá|chứng\s+khoán|cổ\s+phiếu|vàng|crypto)/i },
  // Bài tổng hợp tuần/ngày — không có giá trị tin chuyên đề
  { name: "weekly_digest", re: /^(Tổng\s+hợp\s+tin|Tin\s+(tuần|ngày|tháng)\s+qua|Điểm\s+tin\s+(tuần|sáng|chiều|tối|sớm))/i },
  // Geopolitics/quân sự standalone — "hạt nhân" ở đây là vũ khí, không phải điện hạt nhân
  { name: "geopolitics", re: /(Trump|Iran|Israel|Triều\s+Tiên|Bắc\s+Triều\s+Tiên|Hormuz|chiến\s+tranh|xung\s+đột\s+Trung\s+Đông|tên\s+lửa|vũ\s+khí\s+hạt\s+nhân|chương\s+trình\s+hạt\s+nhân)/i },
  // Lifestyle/tip cá nhân — "tiết kiệm điện" ở đây là mẹo gia đình, không phải tin ngành
  { name: "lifestyle_tip", re: /^(Mẹo|Cách|Có\s+nên|Có\s+đáng|Có\s+thật|Làm\s+sao|Bí\s+quyết|Hướng\s+dẫn)/i },
  // Xe điện consumer launch — không liên quan ngành điện
  { name: "consumer_ev", re: /(Tesla|VinFast|BYD|Xiaomi|Hyundai|Toyota|Kia|Honda)\s+(ra\s+mắt|giới\s+thiệu|công\s+bố|trình\s+làng|thông\s+báo)/i },
];

function classifyTitleBlacklist(title: string): { blacklisted: boolean; reason?: string } {
  for (const { name, re } of BLACKLIST_PATTERNS) {
    if (re.test(title)) {
      // Cứu trợ: title có signal điện rõ ràng → cho qua, để LLM quyết
      if (STRONG_ELEC_RE.test(title)) return { blacklisted: false };
      return { blacklisted: true, reason: name };
    }
  }
  return { blacklisted: false };
}

const CLASSIFY_SYSTEM_PROMPT = `Bạn phân loại tin tức cho trang tổng hợp ngành ĐIỆN Việt Nam. Trọng tâm: điện lực, hạ tầng điện, chính sách điện, chuyển đổi năng lượng sạch phục vụ sản xuất điện.

NGUYÊN TẮC CHUNG: Bài phải có CHỦ ĐỀ CHÍNH là ngành điện/năng lượng điện, không chỉ nhắc lướt. Nếu chủ đề chính là dầu/macro/địa chính trị và chỉ nhắc "năng lượng" thoáng qua → REJECT.

LIÊN QUAN (pass, confidence ≥ 0.7):
- EVN và các tổng công ty điện (NPC, CPC, HCMC, EVNGENCO...), PC1, Petrovietnam Power, nhà máy điện cụ thể
- Sản xuất/truyền tải/phân phối điện: lưới điện, đường dây 500kV, trạm biến áp, công suất đặt
- Giá điện, cung ứng điện, phụ tải, tiết kiệm điện, cắt điện
- Nguồn điện: điện gió, điện mặt trời, điện hạt nhân, thủy điện, nhiệt điện, điện sinh khối, điện khí LNG, BESS
- Chính sách/pháp lý VN: Luật Điện lực, Quy hoạch điện 8, cơ chế mua bán điện trực tiếp (DPPA), hợp đồng PPA
- Bộ Công Thương, Cục Điện lực về vấn đề điện
- LNG terminal / kho cảng khí phục vụ phát điện
- Chuyển đổi năng lượng sạch gắn với ngành điện (hydrogen xanh cho phát điện, BESS lưới điện)
- Hợp tác quốc tế VN về điện/năng lượng (đầu tư, công nghệ điện)

KHÔNG LIÊN QUAN (reject):
- Giá dầu thế giới, dầu thô WTI/Brent, OPEC — ngay cả khi nhắc "tác động năng lượng" chung chung
- Xung đột Trung Đông, địa chính trị (Iran, Israel, Hormuz, Trump) — trừ khi bài tập trung vào tác động CỤ THỂ đến cung ứng điện/LNG cho VN
- Macro VN: CPI, lạm phát, tỷ giá, GDP — trừ khi tập trung vào ngành điện
- Kinh tế chung không chuyên đề điện: Eurozone PMI, hỗ trợ kinh tế châu Âu, tọa đàm hợp tác kinh tế chung
- Lifestyle/văn hóa/sinh hoạt: dress code, mẹo gia đình, trải nghiệm tiêu dùng — kể cả khi nhắc tiết kiệm điện như background
- Bài digest/round-up trộn nhiều chủ đề không liên quan (giveaway: title có ";" hoặc "&" nối lương hưu/BĐS/giáo dục/y tế + điện) — reject ngay cả khi 1 phần là điện, vì nội dung loãng và có thể tìm bài chuyên đề riêng
- Xe điện cá nhân/ô tô (Tesla, VinFast sản phẩm), trạm sạc xe — trừ khi bàn tác động lên lưới điện
- Thiết bị điện gia dụng, điện thoại, điện tử tiêu dùng
- Tài chính doanh nghiệp (ĐHĐCĐ, cổ tức) — trừ khi doanh nghiệp là DN ngành điện và bài bàn về chiến lược điện cụ thể
- Xăng dầu bán lẻ, giá xăng trong nước
- Tài chính xanh/ESG chung chung (trừ khi dự án cụ thể là điện)
- Crypto/tiền điện tử, thời tiết, showbiz, thể thao
- Tin quốc tế không liên quan VN (trừ đột phá công nghệ điện mặt trời/gió/hạt nhân/BESS)

VÍ DỤ REJECT rõ ràng:
- "Giá dầu vượt 100 USD/thùng" → reject (dầu, không phải điện)
- "Xung đột Trung Đông khiến kinh tế Eurozone suy giảm" → reject (macro eurozone)
- "Iran bắt giữ tàu tại Hormuz, giá dầu tăng" → reject (địa chính trị + dầu)
- "Nguồn lực tài chính hỗ trợ các dự án xanh chưa đáp ứng" → reject (tài chính xanh chung)
- "Tọa đàm bàn tròn hợp tác kinh tế VN-Hàn Quốc" → reject (kinh tế chung)
- "Bảo đảm nguồn cung nhiên liệu trong nước" → reject (nhiên liệu, không riêng điện)
- "Chủ động kịch bản điều hành giá trước áp lực lạm phát nhập khẩu" → reject (macro)
- "Công chức Nhật được khuyến khích mặc quần short đi làm" → reject (lifestyle/văn hóa nước ngoài, dù có nhắc tiết kiệm điện)
- "Mẹo tiết kiệm điện trong gia đình mùa hè" → reject (mẹo vặt tiêu dùng, không phải tin ngành)
- "Người Trung Quốc đổ xô mua quạt tích điện vì cắt điện" → reject (tin tiêu dùng nước ngoài)
- "Thay đổi khung giờ tính giá điện, người dân cần chú ý gì; Một phương án tăng lương hưu từ 1-7" → reject (digest trộn 2 chủ đề điện + lương hưu, dù nửa bài là điện)
- "Tổng hợp tin tuần: tăng lương, BĐS, giá điện" → reject (digest weekly mix)
- "Bước đột phá trong động cơ đẩy tàu biển không phát thải carbon" → reject (giao thông biển, không phải ngành điện VN)
- "Caspi nổi lên thành mắt xích an ninh năng lượng Á-Âu" → reject (địa chính trị dầu/khí, không bàn điện cụ thể)
- "Giảm phụ thuộc nhiên liệu hóa thạch trước cú sốc dầu mỏ toàn cầu" → reject (chiến lược dầu mỏ macro, không nói gì điện)
- "Hội nghị toàn cầu về lộ trình từ bỏ nhiên liệu hóa thạch" → reject (climate policy chung, không chuyên đề điện VN)
- "Luật Dầu khí mở sang năng lượng mới: cần thêm bước hoàn thiện" → reject (Luật Dầu khí, chủ đề chính là dầu khí)
- "Lập mạng lưới quan trắc, cảnh báo phóng xạ môi trường quốc gia" → reject (môi trường/an toàn bức xạ, không phải sản xuất điện hạt nhân)
- "Nghệ An đẩy nhanh tiến độ thực hiện dự án trọng điểm" → reject (tiêu đề chung, không nêu rõ điện — phải có nội dung điện cụ thể mới pass)
- "Hồ chứa lớn & bài toán phát triển bền vững" → reject (thủy lợi/môi trường nói chung, không phải vận hành thủy điện)
- "Tập đoàn Hà Đô nói về 1.000 tỷ đồng bán điện bị treo" → pass (DN bán điện, vướng PPA — bài chuyên đề điện)

NGUYÊN TẮC ĐỊNH HƯỚNG (ĐỌC KỸ):
1. "Năng lượng" ĐƠN ĐỘC không đủ — phải có "điện", "EVN", "lưới", "PPA", "BESS", hoặc tên nguồn điện cụ thể (gió/mặt trời/hạt nhân/thủy/nhiệt/khí phát điện) trong title HOẶC mô tả.
2. Bài về "an ninh năng lượng" thuần địa chính trị (dầu/khí thế giới) → REJECT trừ khi nội dung tập trung tác động cụ thể đến cung ứng điện VN.
3. Bài về "nhiên liệu hóa thạch / chuyển dịch năng lượng" cấp toàn cầu/macro → REJECT trừ khi liên quan trực tiếp đến phát điện VN.
4. Khi không chắc → REJECT. Ưu tiên precision hơn recall.

VÍ DỤ PASS rõ ràng:
- "EVN thông báo cung ứng điện mùa khô" → pass
- "Phê duyệt nhà máy điện hạt nhân Ninh Thuận" → pass
- "PC1 mục tiêu doanh thu kỷ lục chiến lược tập trung vào năng lượng" → pass (DN điện, chiến lược điện)
- "Xuất khẩu thiết bị điện mặt trời Trung Quốc kỷ lục" → pass (công nghệ điện mặt trời)
- "Petrovietnam đề xuất 3 trụ cột hợp tác năng lượng với Hàn Quốc" → pass (VN DN năng lượng)

TRẢ VỀ: MẢNG JSON thuần, không markdown. Mỗi phần tử: {"relevant": bool, "confidence": 0.0-1.0, "reason": "≤12 từ"}
confidence < 0.7 sẽ bị coi như reject — chỉ pass với true khi thực sự chắc chắn.`;

const SUMMARIZE_SYSTEM_PROMPT = `Bạn là biên tập viên tin tức chuyên ngành điện Việt Nam. Nhiệm vụ: đọc bài báo và trả về JSON gồm ngày xuất bản + tóm tắt.

ĐỊNH DẠNG ĐẦU RA BẮT BUỘC (JSON thuần, không markdown, không giải thích):
{"published_date": "YYYY-MM-DD hoặc null", "summary": "..."}

QUY TẮC:
- published_date: ngày xuất bản bài. Dạng YYYY-MM-DD. Không đoán.
- summary: tóm tắt dưới 150 từ bằng tiếng Việt, văn phong tin tức chuyên ngành, khách quan.

QUAN TRỌNG — MỞ ĐẦU SUMMARY BẰNG MỐC THỜI GIAN TỰ NHIÊN:
  + Nếu bài nêu rõ buổi/ngày cụ thể: dùng "Sáng 22/4", "Chiều 22/4", "Tối 22/4", "Trưa 22/4", "Đêm 22/4". KHÔNG kèm năm trừ khi bài là sự kiện quá khứ xa hoặc kế hoạch tương lai.
  + Nếu chỉ có ngày (không có buổi): dùng "Ngày 22/4" hoặc "22/4".
  + Nếu là xu hướng/thống kê cả kỳ: dùng "Năm 2025", "Quý I/2026", "Tuần qua", "Đầu tháng 4/2026".
  + Nếu là dự kiến: dùng "Dự kiến tháng 6/2026", "Đến 2030".
  + TUYỆT ĐỐI không dùng định dạng khô cứng "Ngày 22/04/2026" hay "Vào ngày 22/4/2026".
  + Không lặp lại tiêu đề, không mở đầu "Bài báo nói về…", "Theo bài viết…".

CHẤT LƯỢNG NGÔN NGỮ — KIỂM TRA TRƯỚC KHI TRẢ:
  + TUYỆT ĐỐI KHÔNG SAI CHÍNH TẢ tiếng Việt. Vd đúng: "cam kết", "bền vững", "phát triển". SAI: "cam krit", "bền vsustainable".
  + KHÔNG trộn từ tiếng Anh vào giữa cụm từ tiếng Việt. Nếu cần dùng thuật ngữ nước ngoài, viết nguyên cụm bằng tiếng Anh có dấu ngoặc kép, không ghép nửa Việt nửa Anh.
  + Đọc lại summary trước khi trả về JSON để bắt lỗi chính tả/từ ghép sai.`;

// ---------- Utilities ----------

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function canonicalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    u.hash = "";
    const keep = new URLSearchParams();
    u.searchParams.forEach((v, k) => {
      if (!k.startsWith("utm_") && k !== "fbclid" && k !== "gclid") keep.set(k, v);
    });
    u.search = keep.toString() ? `?${keep.toString()}` : "";
    let s = u.toString();
    if (s.endsWith("/")) s = s.slice(0, -1);
    return s;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, "Accept-Language": "vi,en;q=0.8" },
      redirect: "follow",
    });
  } finally {
    clearTimeout(t);
  }
}

// HTML entity decoder: handles named entities (amp, oacute, hellip, ...) plus
// numeric refs &#NNN; and &#xHH;. RSS feeds (Thanh Niên, một số báo) thường gửi
// title chứa entity như "c&oacute; &aacute;p &#039;..." — decoder cũ chỉ xử lý
// 6 entity XML chuẩn nên các ký tự có dấu bị giữ nguyên dạng entity.
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  oacute: "ó", Oacute: "Ó", aacute: "á", Aacute: "Á",
  eacute: "é", Eacute: "É", iacute: "í", Iacute: "Í",
  uacute: "ú", Uacute: "Ú", yacute: "ý", Yacute: "Ý",
  ograve: "ò", Ograve: "Ò", agrave: "à", Agrave: "À",
  egrave: "è", Egrave: "È", igrave: "ì", Igrave: "Ì",
  ugrave: "ù", Ugrave: "Ù",
  ocirc: "ô", Ocirc: "Ô", acirc: "â", Acirc: "Â",
  ecirc: "ê", Ecirc: "Ê", icirc: "î", Icirc: "Î",
  ucirc: "û", Ucirc: "Û",
  otilde: "õ", Otilde: "Õ", atilde: "ã", Atilde: "Ã",
  ntilde: "ñ", Ntilde: "Ñ",
  ouml: "ö", auml: "ä", iuml: "ï", uuml: "ü",
  hellip: "…", mdash: "—", ndash: "–",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  bull: "•", middot: "·", copy: "©", reg: "®", trade: "™",
};

function unescapeXml(s: string): string {
  if (!s) return s;
  // Loop tới khi stable (max 3 vòng) để xử lý double-encoded entity từ một số RSS
  // VN CMS encode hai lần: "T&amp;amp;T" → "T&amp;T" → "T&T". Single pass cũ chỉ
  // decode lớp ngoài → giữ "T&amp;T" raw trong DB.
  let prev = "";
  let cur = s;
  for (let i = 0; i < 3 && cur !== prev; i++) {
    prev = cur;
    cur = cur
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
      .replace(/&([a-zA-Z][a-zA-Z0-9]+);/g, (m, name) => NAMED_ENTITIES[name] ?? m);
  }
  return cur;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

interface RssItem {
  title: string;
  link: string;
  pubDate: string | null;
  description: string;
  feedName: string;
}

function parseRss(xml: string, feedName: string): RssItem[] {
  const items: RssItem[] = [];
  const matches = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const it of matches) {
    const pick = (tag: string) => {
      const m = it.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
      return m ? unescapeXml(m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim()) : "";
    };
    const title = pick("title");
    let link = pick("link");
    if (!link) {
      const g = it.match(/<guid[^>]*>([\s\S]*?)<\/guid>/);
      if (g) link = unescapeXml(g[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim());
    }
    const pubDate = pick("pubDate") || null;
    const description = stripHtml(pick("description"));
    if (link && title) items.push({ title, link, pubDate, description, feedName });
  }
  return items;
}

// Extract "virtual RSS items" từ trang section HTML: mỗi <a> match linkPattern
// lấy làm 1 item; title là text của link (hoặc heading gần nhất). Không có pubDate.
function parseHtmlListPage(html: string, baseUrl: string, linkPattern: RegExp, feedName: string): RssItem[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) return [];
  const seen = new Set<string>();
  const items: RssItem[] = [];
  doc.querySelectorAll("a[href]").forEach((a) => {
    const el = a as Element;
    const href = el.getAttribute("href");
    if (!href) return;
    let abs: URL;
    try { abs = new URL(href, baseUrl); } catch { return; }
    if (abs.host.replace(/^www\./, "") !== new URL(baseUrl).host.replace(/^www\./, "")) return;
    if (!linkPattern.test(abs.pathname)) return;
    const canonical = abs.toString();
    if (seen.has(canonical)) return;

    // Title: link text, fallback sang heading gần nhất trong parent
    let title = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (title.length < 15) {
      const parent = el.parentElement;
      const heading = parent?.querySelector("h1,h2,h3,h4")?.textContent?.trim() || "";
      if (heading.length > title.length) title = heading.replace(/\s+/g, " ").trim();
    }
    if (title.length < 15) return; // bỏ link pagination/tag có text quá ngắn

    seen.add(canonical);
    items.push({
      title: title.slice(0, 300),
      link: canonical,
      pubDate: null,
      description: "",
      feedName,
    });
  });
  return items;
}

function extractPublishedDateFromHtml(html: string): string | null {
  const patterns: RegExp[] = [
    /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']article:published_time["']/i,
    /<meta[^>]+itemprop=["']datePublished["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+itemprop=["']datePublished["']/i,
    /<meta[^>]+name=["'](?:pubdate|publishdate|publish_date|date|DC\.date\.issued)["'][^>]+content=["']([^"']+)["']/i,
    /"datePublished"\s*:\s*"([^"]+)"/,
    /<time[^>]+datetime=["']([^"']+)["']/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) {
      const d = new Date(m[1]);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
  }
  return null;
}

function extractArticleContent(html: string): { title: string; content: string } {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) return { title: "", content: "" };
  const title =
    doc.querySelector("meta[property='og:title']")?.getAttribute("content") ||
    doc.querySelector("title")?.textContent ||
    doc.querySelector("h1")?.textContent || "";

  // Selectors từ chặt → lỏng. Ưu tiên chọn element có LONGEST text (tránh chọn wrapper
  // có cả sidebar). Loại bỏ <main> nếu nó bao cả trang (wrapper quá rộng).
  const selectors = [
    "[itemprop='articleBody']",
    "[class*='article-content']", "[class*='article__body']", "[class*='article-body']",
    "[class*='detail__content']", "[class*='detail-content']", "[class*='content-detail']",
    "[class*='news-detail']", "[class*='main-detail']", "[class*='singular-content']",
    "[class*='fck_detail']", "[class*='post-body']", "[class*='entry-content']",
    "[class*='zone__content']", "[class*='general-item_content']",
    "article",
  ];

  let contentEl: Element | null = null;
  let maxLen = 0;
  for (const sel of selectors) {
    try {
      doc.querySelectorAll(sel).forEach((el) => {
        const len = (el.textContent || "").trim().length;
        if (len > maxLen && len > 300) {
          contentEl = el as Element;
          maxLen = len;
        }
      });
      if (contentEl) break;
    } catch { /* bad selector */ }
  }

  let content = "";
  if (contentEl) {
    contentEl.querySelectorAll("script, style, iframe, nav, footer, aside, .advertisement, .related-news, .box-tags, .author-info, .box-related, .related-articles, .sidebar, .banner").forEach((n) => (n as Element).remove());
    content = contentEl.textContent || "";
  }

  // Fallback 1: meta description (dùng khi không match selector nào)
  if (content.length < 300) {
    const ogDesc = doc.querySelector("meta[property='og:description']")?.getAttribute("content") || "";
    const metaDesc = doc.querySelector("meta[name='description']")?.getAttribute("content") || "";
    const desc = (ogDesc.length > metaDesc.length ? ogDesc : metaDesc).trim();
    if (desc.length > 150) content = desc;
  }

  // Fallback 2: concat <p> nhưng chỉ trong <main> hoặc <article>, tránh sidebar global
  if (content.length < 300) {
    const mainEl = doc.querySelector("main") || doc.querySelector("article") || doc.body;
    const ps: string[] = [];
    mainEl?.querySelectorAll("p").forEach((p) => {
      const t = (p.textContent || "").trim();
      if (t.length > 40) ps.push(t);
    });
    content = ps.join("\n");
  }

  content = content.replace(/\s+/g, " ").trim().slice(0, MAX_CONTENT_CHARS);
  return { title: (title || "").replace(/\s+/g, " ").trim(), content };
}

// Detect summary mà LLM trả về dạng "xin lỗi, nội dung không khớp" — skip insert
function isInvalidSummary(summary: string): boolean {
  const badPatterns = [
    /^nội dung bài (không|chưa)/i,
    /không (cung cấp|phù hợp|liên quan) (thông tin|với tiêu đề)/i,
    /^bài (báo|viết) (không|chưa) (cung cấp|đề cập|nói)/i,
    /^xin lỗi/i,
    /^tôi (không thể|cần thêm)/i,
  ];
  return badPatterns.some((p) => p.test(summary));
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

// ---------- LLM calls ----------

async function classifyBatch(
  items: RssItem[],
  apiKey: string,
  supabase: SupabaseClient | null = null,
): Promise<Array<{ relevant: boolean | null; confidence: number; reason: string }>> {
  const batchSize = 10;
  const out: Array<{ relevant: boolean | null; confidence: number; reason: string }> = [];

  for (let start = 0; start < items.length; start += batchSize) {
    const batch = items.slice(start, start + batchSize);
    const userMsg = `Phân loại ${batch.length} bài, trả MẢNG JSON ${batch.length} phần tử theo đúng thứ tự.\n\n`
      + batch.map((c, i) => `[${i}] TITLE: ${c.title}\nDESC: ${(c.description || "").slice(0, 400)}`).join("\n\n");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1500,
        system: CLASSIFY_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMsg }],
      }),
    });
    if (!res.ok) throw new Error(`classify HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    if (supabase && data?.usage) {
      await logLlmUsage(supabase, {
        functionName: "discovery-rss-news:classify",
        model: ANTHROPIC_MODEL,
        usage: data.usage,
      });
    }
    const text: string = data?.content?.[0]?.text ?? "[]";
    const m = text.match(/\[[\s\S]*\]/);
    let parsed: unknown;
    try {
      parsed = JSON.parse(m?.[0] ?? text);
    } catch {
      parsed = batch.map(() => ({ relevant: null, confidence: 0, reason: "parse-fail" }));
    }
    const arr = Array.isArray(parsed) ? parsed : [];
    for (let i = 0; i < batch.length; i++) {
      const r = arr[i] as { relevant?: unknown; confidence?: unknown; reason?: unknown } | undefined;
      out.push({
        relevant: typeof r?.relevant === "boolean" ? r.relevant : null,
        confidence: typeof r?.confidence === "number" ? r.confidence : 0,
        reason: typeof r?.reason === "string" ? r.reason : "",
      });
    }
  }
  return out;
}

async function summarizeWithClaude(
  title: string,
  content: string,
  apiKey: string,
  knownPublishedDate: string | null = null,
  supabase: SupabaseClient | null = null,
): Promise<{ summary: string; publishedDate: string | null }> {
  const todayIso = new Date().toISOString().slice(0, 10);
  const dateHint = knownPublishedDate
    ? `\n\nNgày xuất bản đã xác định từ metadata: ${knownPublishedDate}. Dùng đúng ngày/tháng/NĂM này khi nhắc mốc thời gian trong summary, KHÔNG đoán năm khác.`
    : `\n\nKhông có ngày từ metadata. Nếu bài chỉ ghi "ngày 20/4" không kèm năm, mặc định là năm ${todayIso.slice(0, 4)} (hôm nay là ${todayIso}).`;
  const userMsg = `Tiêu đề: ${title}\n\nNội dung:\n${content}${dateHint}`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 700,
      temperature: 0.3,
      system: SUMMARIZE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMsg }],
    }),
  });
  if (!res.ok) throw new Error(`summarize HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  if (supabase && data?.usage) {
    await logLlmUsage(supabase, {
      functionName: "discovery-rss-news:summarize",
      model: ANTHROPIC_MODEL,
      usage: data.usage,
    });
  }
  const raw: string = (data?.content?.[0]?.text ?? "").trim();

  // Strip markdown fences Claude đôi khi wrap (```json ... ```)
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const p = JSON.parse(m[0]);
      const summary = String(p.summary ?? "").trim();
      const pd = p.published_date;
      const publishedDate = typeof pd === "string" && /^\d{4}-\d{2}-\d{2}$/.test(pd) ? pd : null;
      return { summary, publishedDate };
    } catch {
      // JSON malformed (vd Claude double-escape "\\\""): fall through.
    }
  }

  // Fallback regex extract — cứu data dù JSON malformed
  const sumMatch = cleaned.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const dateMatch = cleaned.match(/"published_date"\s*:\s*"(\d{4}-\d{2}-\d{2})"/);
  if (sumMatch) {
    const summary = sumMatch[1]
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\")
      .replace(/\\n/g, "\n")
      .trim();
    return { summary, publishedDate: dateMatch?.[1] ?? null };
  }

  return { summary: raw, publishedDate: null };
}

// ---------- Main handler ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    return await handle(req);
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.error("uncaught:", msg, (e as Error)?.stack);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function handle(req?: Request): Promise<Response> {
  // dry_run=true: chạy đến hết LLM classify, return chi tiết tất cả
  // {title, url, confidence, reason, would_pass} và SKIP insert. Dùng để
  // user xem bài borderline (confidence < MIN_CLASSIFY_CONFIDENCE) trước
  // khi build approval queue.
  const isDryRun = req
    ? new URL(req.url).searchParams.get("dry_run") === "true"
    : false;
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  if (!anthropicKey) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  // Lấy virtual source "RSS Discovery"
  const { data: src, error: srcErr } = await supabase
    .from("electricity_sources")
    .select("id, name, category")
    .eq("name", DISCOVERY_SOURCE_NAME)
    .maybeSingle();
  if (srcErr || !src) {
    return new Response(JSON.stringify({ error: `Virtual source "${DISCOVERY_SOURCE_NAME}" not found. Run migration.` }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const stats = {
    feedsFetched: 0,
    feedsFailed: 0,
    totalItems: 0,
    afterWindow: 0,
    afterKeyword: 0,
    afterBlacklist: 0,
    blacklistedSamples: [] as Array<{ title: string; reason: string }>,
    classified: 0,
    relevant: 0,
    inserted: 0,
    errors: [] as string[],
  };

  // 1a. Fetch RSS feeds in parallel
  const rssResults = await Promise.allSettled(
    FEEDS.map(async (f) => {
      const r = await fetchWithTimeout(f.url, FEED_FETCH_TIMEOUT_MS);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return parseRss(await r.text(), f.name);
    }),
  );
  const allItems: RssItem[] = [];
  for (let i = 0; i < FEEDS.length; i++) {
    const res = rssResults[i];
    if (res.status === "fulfilled") {
      stats.feedsFetched++;
      allItems.push(...res.value);
    } else {
      stats.feedsFailed++;
      stats.errors.push(`rss ${FEEDS[i].name}: ${(res.reason as Error)?.message ?? "?"}`);
    }
  }

  // 1b. Fetch HTML list pages in parallel, extract virtual items
  const htmlResults = await Promise.allSettled(
    HTML_FEEDS.map(async (f) => {
      const r = await fetchWithTimeout(f.listUrl, FEED_FETCH_TIMEOUT_MS);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return parseHtmlListPage(await r.text(), f.listUrl, new RegExp(f.linkPattern), f.name);
    }),
  );
  for (let i = 0; i < HTML_FEEDS.length; i++) {
    const res = htmlResults[i];
    if (res.status === "fulfilled") {
      stats.feedsFetched++;
      allItems.push(...res.value);
    } else {
      stats.feedsFailed++;
      stats.errors.push(`html ${HTML_FEEDS[i].name}: ${(res.reason as Error)?.message ?? "?"}`);
    }
  }
  stats.totalItems = allItems.length;

  // 2. Window + dedupe by URL
  const now = Date.now();
  const byUrl = new Map<string, RssItem>();
  for (const it of allItems) {
    const pubMs = it.pubDate ? Date.parse(it.pubDate) : NaN;
    if (!isNaN(pubMs) && now - pubMs > WINDOW_MS) continue;
    const canon = canonicalizeUrl(it.link);
    if (!canon) continue;
    if (!byUrl.has(canon)) byUrl.set(canon, { ...it, link: canon });
  }
  stats.afterWindow = byUrl.size;

  // 3. Keyword pre-filter + title blacklist
  // Tier-1 trusted sources bypass KEYWORD_RE: bài chính sách Tô Lâm/Lê Minh Hưng/Bộ Công Thương
  // thường có title protocol-style không có "điện" keyword nhưng body có nội dung quan trọng.
  // Audit 08/05: missed 3 bài Tô Lâm Mumbai + Lê Minh Hưng ASEAN + Phan Thị Thắng MoIT.
  // Trade-off: thêm ~100-200 classifier calls/ngày (~$0.05-0.1) đổi lấy yield chính sách.
  const TIER1_TRUSTED_FEEDS = new Set([
    "Báo Chính Phủ",
    "Bộ Công Thương - Tin tức",
  ]);
  let keywordPass: RssItem[] = [];
  let keywordHits = 0;
  for (const it of byUrl.values()) {
    const isTier1 = TIER1_TRUSTED_FEEDS.has(it.feedName);
    if (!isTier1 && !KEYWORD_RE.test(`${it.title} ${it.description}`)) continue;
    keywordHits++;
    const bl = classifyTitleBlacklist(it.title);
    if (bl.blacklisted) {
      if (stats.blacklistedSamples.length < 5) {
        stats.blacklistedSamples.push({ title: it.title.slice(0, 120), reason: bl.reason! });
      }
      continue;
    }
    // Pre-LLM noise: "Lịch cúp/cắt điện ..." (info dịch vụ, ~13% nhiễu trong audit 07/05)
    if (isOperationalScheduleNoise(it.title)) {
      if (stats.blacklistedSamples.length < 5) {
        stats.blacklistedSamples.push({ title: it.title.slice(0, 120), reason: "operational_schedule" });
      }
      continue;
    }
    keywordPass.push(it);
  }
  stats.afterKeyword = keywordHits;
  stats.afterBlacklist = keywordPass.length;
  keywordPass.sort((a, b) => (Date.parse(b.pubDate || "") || 0) - (Date.parse(a.pubDate || "") || 0));

  // 4. Dedupe vs DB (url_hash)
  const urlHashMap = new Map<string, string>();
  for (const it of keywordPass) urlHashMap.set(it.link, await sha256Hex(it.link));
  const hashes = Array.from(urlHashMap.values());
  if (hashes.length > 0) {
    const { data: existing } = await supabase
      .from("electricity_news")
      .select("url_hash")
      .in("url_hash", hashes);
    const existingSet = new Set((existing ?? []).map((r) => r.url_hash as string));
    keywordPass = keywordPass.filter((it) => !existingSet.has(urlHashMap.get(it.link)!));
  }

  // 5. Cap + LLM classify
  const toClassify = keywordPass.slice(0, MAX_CANDIDATES_PER_RUN);
  if (toClassify.length === 0) {
    return new Response(JSON.stringify({ ok: true, stats, note: "no new candidates after dedupe" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const classifications = await classifyBatch(toClassify, anthropicKey, supabase);
  stats.classified = classifications.length;
  const relevant = toClassify.filter((_, i) => {
    const c = classifications[i];
    return c.relevant === true && c.confidence >= MIN_CLASSIFY_CONFIDENCE;
  });
  stats.relevant = relevant.length;

  if (isDryRun) {
    const detail = toClassify.map((it, i) => {
      const c = classifications[i];
      return {
        title: it.title,
        url: it.link,
        feed: it.feedName,
        relevant: c.relevant,
        confidence: c.confidence,
        reason: c.reason,
        would_pass: c.relevant === true && c.confidence >= MIN_CLASSIFY_CONFIDENCE,
      };
    });
    detail.sort((a, b) => b.confidence - a.confidence);
    return new Response(JSON.stringify({
      ok: true, dry_run: true, threshold: MIN_CLASSIFY_CONFIDENCE,
      stats, classifications: detail,
    }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 6. Fetch + summarize + insert (parallel 3)
  const toInsert = relevant.slice(0, MAX_INSERTS_PER_RUN);
  const insertedUrls = new Set<string>();
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;

  const processOne = async (it: RssItem) => {
    try {
      const artRes = await fetchWithTimeout(it.link, ARTICLE_FETCH_TIMEOUT_MS);
      if (!artRes.ok) {
        stats.errors.push(`${it.feedName}: HTTP ${artRes.status}`);
        return;
      }
      const html = await artRes.text();
      const { title: extractedTitle, content } = extractArticleContent(html);
      const title = it.title || extractedTitle;
      if (!content || content.length < 200) {
        stats.errors.push(`${it.feedName}: content too short (${content.length})`);
        return;
      }
      const metaDate = extractPublishedDateFromHtml(html);
      const rssDate = it.pubDate ? new Date(it.pubDate).toISOString() : null;
      const preDate = metaDate ?? rssDate;
      if (preDate) {
        const age = now - new Date(preDate).getTime();
        if (age > threeDaysMs) {
          stats.errors.push(`${it.feedName}: bài cũ (${preDate.slice(0, 10)})`);
          return;
        }
      }

      // Pre-LLM fuzzy dedupe (cùng tin lan ra nhiều nguồn) — tiết kiệm summarize token.
      try {
        const { data: simRows } = await supabase.rpc("find_similar_existing_title", {
          candidate_title: title,
        });
        if (Array.isArray(simRows) && simRows.length > 0) {
          const m = simRows[0];
          stats.errors.push(`${it.feedName}: skip fuzzy-dup of ${m.id} (sim=${(m.similarity ?? 0).toFixed(2)})`);
          return;
        }
      } catch (e) {
        console.warn(`[fuzzy-dedupe] rpc fail: ${(e as Error).message}`);
      }

      const preDateIso = preDate ? preDate.slice(0, 10) : null;
      const { summary, publishedDate } = await summarizeWithClaude(title, content, anthropicKey, preDateIso, supabase);
      if (!summary) {
        stats.errors.push(`${it.feedName}: Claude empty summary`);
        return;
      }
      if (isInvalidSummary(summary)) {
        stats.errors.push(`${it.feedName}: title-content mismatch, skip`);
        return;
      }
      const llmIso = publishedDate ? `${publishedDate}T00:00:00Z` : null;
      const publishedAt = preDate ?? llmIso;
      if (!publishedAt) {
        stats.errors.push(`${it.feedName}: no published date`);
        return;
      }
      const age = now - new Date(publishedAt).getTime();
      if (age > threeDaysMs) {
        stats.errors.push(`${it.feedName}: bài cũ (${publishedAt.slice(0, 10)})`);
        return;
      }

      // Lưu domain ra cột riêng để dashboard group được mà không cần parse source_name.
      let host = "";
      try { host = new URL(it.link).host.replace(/^www\./, ""); } catch { /* ignore */ }

      const { error: insErr } = await supabase.from("electricity_news").insert({
        source_id: src.id,
        source_name: src.name,
        source_domain: host || null,
        source_category: src.category,
        title,
        summary,
        original_url: it.link,
        url_hash: urlHashMap.get(it.link)!,
        published_at: publishedAt,
        summary_word_count: wordCount(summary),
      });
      if (insErr) {
        if (!String(insErr.message).includes("duplicate")) {
          stats.errors.push(`${it.feedName}: insert ${insErr.message}`);
        }
      } else {
        stats.inserted++;
        insertedUrls.add(it.link);
      }
    } catch (e) {
      stats.errors.push(`${it.feedName}: ${(e as Error).message}`);
    }
  };

  // Concurrency 3
  const queue = [...toInsert];
  const workers = Array.from({ length: 3 }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (!item) return;
      await processOne(item);
    }
  });
  await Promise.all(workers);

  // Log mọi LLM classification (cả pass + reject) cho threshold analysis.
  // Không await response (background insert ok — không block response). Nếu
  // log fail, không ảnh hưởng pipeline chính.
  const logRows = toClassify.map((it, i) => {
    const c = classifications[i];
    return {
      feed_name: it.feedName.slice(0, 100),
      title: it.title.slice(0, 500),
      url: it.link.slice(0, 1000),
      url_hash: urlHashMap.get(it.link) ?? null,
      relevant: c.relevant,
      confidence: c.confidence,
      reason: (c.reason ?? "").slice(0, 200),
      inserted: insertedUrls.has(it.link),
    };
  });
  await supabase.from("discovery_classification_log").insert(logRows);

  // Update last_crawled_at on virtual source
  await supabase
    .from("electricity_sources")
    .update({ last_crawled_at: new Date().toISOString(), consecutive_failures: 0, last_error: null })
    .eq("id", src.id);

  return new Response(JSON.stringify({ ok: true, stats }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
