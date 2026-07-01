// Đo lường traffic THẬT: Google Analytics 4 (GA4) + Meta (Facebook) Pixel.
// ID lấy từ biến môi trường build-time (Vercel → Environment Variables):
//   VITE_GA_ID          = "G-XXXXXXXXXX"   (GA4 Measurement ID)
//   VITE_META_PIXEL_ID  = "1234567890"     (Meta Pixel ID)
// Chưa cấu hình → KHÔNG tải gì (no-op) → an toàn cho local/preview.
// SPA không tự reload nên page_view được gửi THỦ CÔNG theo mỗi lần đổi route.

const env = import.meta.env as Record<string, string | undefined>;
// GA4 nạp TĨNH trong index.html (để Search Console verify được). Hằng số này chỉ
// dùng để bật gửi page_view theo route; đồng bộ với gtag config ở index.html.
export const GA_ID = "G-B376EPJ51P";
// Meta Pixel: chưa tạo → để trống (no-op). Điền khi chạy Facebook Ads.
export const META_PIXEL_ID = (env.VITE_META_PIXEL_ID ?? "").trim();

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: ((...args: unknown[]) => void) & Record<string, unknown>;
    _fbq?: unknown;
  }
}

let initialized = false;

// Nạp Meta Pixel 1 lần (GA4 đã nạp tĩnh trong index.html). KHÔNG bắn page_view ở
// đây — để trackPageview lo (tránh đếm trùng lần tải đầu).
export function initAnalytics(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  if (META_PIXEL_ID) {
    const w = window as unknown as { fbq?: any; _fbq?: any };
    if (!w.fbq) {
      const n: any = (w.fbq = function () {
        // eslint-disable-next-line prefer-rest-params
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      });
      if (!w._fbq) w._fbq = n;
      n.push = n;
      n.loaded = true;
      n.version = "2.0";
      n.queue = [];
      const t = document.createElement("script");
      t.async = true;
      t.src = "https://connect.facebook.net/en_US/fbevents.js";
      document.head.appendChild(t);
    }
    window.fbq!("init", META_PIXEL_ID);
  }
}

// Gửi 1 lượt xem trang (gọi mỗi lần đổi route).
export function trackPageview(path: string): void {
  if (typeof window === "undefined") return;
  if (GA_ID && window.gtag) window.gtag("event", "page_view", { page_path: path });
  if (META_PIXEL_ID && window.fbq) window.fbq("track", "PageView");
}
