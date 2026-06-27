// URL canonicalize + SHA-256 — tách từ crawl-electricity-news/index.ts để dùng
// chung cho dedup (submit-news, ...). Giữ nguyên quy tắc: bỏ hash, bỏ utm_*/fbclid,
// bỏ trailing slash.

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function canonicalizeUrl(rawUrl: string, base?: string): string | null {
  try {
    const u = base ? new URL(rawUrl, base) : new URL(rawUrl);
    u.hash = "";
    const keep = new URLSearchParams();
    u.searchParams.forEach((v, k) => {
      if (!k.startsWith("utm_") && k !== "fbclid") keep.set(k, v);
    });
    u.search = keep.toString() ? `?${keep.toString()}` : "";
    let s = u.toString();
    if (s.endsWith("/")) s = s.slice(0, -1);
    return s;
  } catch {
    return null;
  }
}
