// Vietnamese electricity/energy keyword regex — topical pre-filter shared
// by crawl-electricity-news (per-source) and discovery-rss-news (multi-feed).
// Keep both in sync via this single source of truth.
//
// Idiom guards on standalone "điện":
//   - Negative lookbehind (?<!gọi\s) excludes "gọi điện" (= phone call)
//   - Negative lookahead drops common non-electricity compounds:
//     thoại/tử/ảnh/máy/đàm/văn/tín (telephone/tv/cinema/appliance/fax/telegram)
//     báo/hoa (idiom "điện báo" = telegram-style notify, "điện hoa" = florist)
// Mirror in luot247-scraper/topic_filter.py — keep in sync.

export const ELECTRICITY_KEYWORD_RE = /\b(EVN|BESS|(?<!gọi\s)điện(?!\s*(thoại|tử|ảnh|máy|đàm|văn|tín|báo|hoa))|năng\s*lượng|điện\s*lực|điện\s*gió|điện\s*mặt\s*trời|điện\s*hạt\s*nhân|điện\s*sinh\s*khối|thủy\s*điện|nhiệt\s*điện|lưới\s*điện|cung\s*ứng\s*điện|giá\s*điện|tiết\s*kiệm\s*điện|pin\s*lưu\s*trữ|lưu\s*trữ\s*điện|pin\s*(natri|lithium|li-?ion)|hydro\s*xanh|xe\s*điện|Bộ\s*Công\s*Thương|Cục\s*Điện\s*lực|NLTT|PPA|DPPA|Quy\s*hoạch\s*điện)/i;

export function isElectricityTopical(text: string): boolean {
  if (!text) return false;
  return ELECTRICITY_KEYWORD_RE.test(text);
}
