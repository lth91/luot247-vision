import { ExternalLink } from "lucide-react";
import { formatVietnamDateShort, getRelativeTime } from "@/lib/dateUtils";

interface ElectricityNewsCardProps {
  title: string;
  summary: string;
  originalUrl: string;
  publishedAt: string | null;
  crawledAt: string;
}

export const ElectricityNewsCard = ({
  title,
  summary,
  originalUrl,
  publishedAt,
  crawledAt,
}: ElectricityNewsCardProps) => {
  // Hiển thị 2 timestamp tách biệt để khớp với sort = crawled_at:
  //   - Primary: "Tìm thấy X phút trước" (crawled_at) — match thứ tự /d
  //   - Secondary: "Báo đăng Y giờ trước" (published_at) — context của bài gốc
  // Trước đây chỉ show 1 timestamp = published_at ?? crawled_at gây confusing
  // (bài crawl 30' nhưng publish 3h hiển thị "3 giờ trước" dù đang nằm đầu list).
  const showPublished = publishedAt && publishedAt !== crawledAt;
  return (
    <div className="p-4 flex flex-col gap-3">
      <h3 className="font-semibold text-base leading-snug">{title}</h3>

      <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
        {summary}
      </p>

      <div className="flex items-center justify-between gap-2">
        <a
          href={originalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          Đọc bài gốc <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <div
          className="text-xs text-muted-foreground text-right leading-tight"
          title={`Cào: ${formatVietnamDateShort(crawledAt)}${publishedAt ? ` · Đăng: ${formatVietnamDateShort(publishedAt)}` : ""}`}
        >
          <div>Tìm thấy {getRelativeTime(crawledAt)}</div>
          {showPublished && (
            <div className="text-[10px] opacity-70">Đăng {getRelativeTime(publishedAt!)}</div>
          )}
        </div>
      </div>
    </div>
  );
};
