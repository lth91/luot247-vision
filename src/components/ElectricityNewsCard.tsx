import { ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatVietnamDateShort, getRelativeTime } from "@/lib/dateUtils";

interface ElectricityNewsCardProps {
  title: string;
  summary: string;
  sourceName: string;
  sourceCategory: string | null;
  originalUrl: string;
  publishedAt: string | null;
  crawledAt: string;
}

const categoryLabels: Record<string, string> = {
  "co-quan": "Cơ quan",
  "doanh-nghiep": "Doanh nghiệp",
  "bao-chi": "Báo chí",
};

const categoryColors: Record<string, string> = {
  "co-quan": "bg-red-100 text-red-800 border-red-200",
  "doanh-nghiep": "bg-blue-100 text-blue-800 border-blue-200",
  "bao-chi": "bg-green-100 text-green-800 border-green-200",
};

export const ElectricityNewsCard = ({
  title,
  summary,
  sourceName,
  sourceCategory,
  originalUrl,
  publishedAt,
  crawledAt,
}: ElectricityNewsCardProps) => {
  const displayDate = publishedAt ?? crawledAt;
  return (
    <Card className="p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant="outline"
            className={sourceCategory ? categoryColors[sourceCategory] : ""}
          >
            {sourceCategory ? categoryLabels[sourceCategory] ?? sourceCategory : "Khác"}
          </Badge>
          <span className="text-xs text-muted-foreground font-medium">{sourceName}</span>
        </div>
        <span className="text-xs text-muted-foreground" title={formatVietnamDateShort(displayDate)}>
          {getRelativeTime(displayDate)}
        </span>
      </div>

      <h3 className="font-semibold text-base leading-snug line-clamp-2">{title}</h3>

      <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
        {summary}
      </p>

      <a
        href={originalUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-auto"
      >
        Đọc bài gốc <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </Card>
  );
};
