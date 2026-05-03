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
  const displayDate = publishedAt ?? crawledAt;
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
        <span
          className="text-xs text-muted-foreground"
          title={formatVietnamDateShort(displayDate)}
        >
          {getRelativeTime(displayDate)}
        </span>
      </div>
    </div>
  );
};
