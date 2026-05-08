// Vietnamese electricity/energy keyword regex — topical pre-filter shared
// by crawl-electricity-news (per-source) and discovery-rss-news (multi-feed).
// Keep both in sync via this single source of truth.
//
// Boundary: dùng `(?<![\p{L}\p{N}_])` + flag `u` thay vì `\b` vì JS `\b`
// chỉ nhận ASCII word chars. Chữ Việt có dấu (đ, ă, ê, ơ...) là Unicode
// non-ASCII → `\b` không match trước `điện` ở vị trí giữa câu sau space
// → miss nhiều bài on-topic (vd "điện gió ngoài khơi", "lưới điện").
// Lookbehind Unicode-aware match khi preceding char không phải letter/digit.
//
// Idiom guards on standalone "điện":
//   - Negative lookbehind (?<!gọi\s) excludes "gọi điện" (= phone call)
//   - Negative lookahead drops common non-electricity compounds:
//     thoại/tử/ảnh/máy/đàm/văn/tín (telephone/tv/cinema/appliance/fax/telegram)
//     báo/hoa (idiom "điện báo" = telegram-style notify, "điện hoa" = florist)
// Mirror in luot247-scraper/topic_filter.py — keep in sync. (Python `\b`
// đã handle Unicode tốt nên Python regex đơn giản hơn.)

export const ELECTRICITY_KEYWORD_RE = /(?<![\p{L}\p{N}_])(EVN|BESS|(?<!gọi\s)điện(?!\s*(thoại|tử|ảnh|máy|đàm|văn|tín|báo|hoa))|năng\s*lượng|điện\s*lực|điện\s*gió|điện\s*mặt\s*trời|điện\s*hạt\s*nhân|điện\s*sinh\s*khối|thủy\s*điện|nhiệt\s*điện|lưới\s*điện|cung\s*ứng\s*điện|giá\s*điện|tiết\s*kiệm\s*điện|pin\s*lưu\s*trữ|lưu\s*trữ\s*điện|pin\s*(natri|lithium|li-?ion)|hydro\s*xanh|xe\s*điện|Bộ\s*Công\s*Thương|Cục\s*Điện\s*lực|NLTT|PPA|DPPA|Quy\s*hoạch\s*điện)/iu;

export function isElectricityTopical(text: string): boolean {
  if (!text) return false;
  return ELECTRICITY_KEYWORD_RE.test(text);
}

// Operational/service-info noise — info dịch vụ tỉnh thành, không có giá trị tin tức.
// Match: "Lịch cúp điện ...", "Lịch cắt điện ...", "Lịch mất điện ..." kèm ngày DD/MM.
// Audit 2026-05-07: 9/71 bài là pattern này (~13% noise).
const OPERATIONAL_SCHEDULE_RE =
  /^\s*lịch\s+(cúp|cắt|mất)\s*điện\b/iu;

export function isOperationalScheduleNoise(title: string): boolean {
  if (!title) return false;
  return OPERATIONAL_SCHEDULE_RE.test(title);
}
