import { ExternalLink, ShieldCheck, Newspaper } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatVietnamDateShort, getRelativeTime } from "@/lib/dateUtils";

interface ElectricityNewsCardProps {
  title: string;
  summary: string;
  originalUrl: string;
  publishedAt: string | null;
  crawledAt: string;
  tier?: number | null;
}

const TIER_BADGE: Record<number, {
  label: string;
  Icon: typeof ShieldCheck;
  cls: string;
}> = {
  1: {
    label: "Chính thức",
    Icon: ShieldCheck,
    cls: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50",
  },
  2: {
    label: "Chuyên ngành",
    Icon: Newspaper,
    cls: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
  },
};

export const ElectricityNewsCard = ({
  title,
  summary,
  originalUrl,
  publishedAt,
  crawledAt,
  tier,
}: ElectricityNewsCardProps) => {
  const displayDate = publishedAt ?? crawledAt;
  const badge = tier ? TIER_BADGE[tier] : null;
  return (
    <Card className="p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
      {badge && (
        <Badge variant="outline" className={`gap-1 w-fit font-normal ${badge.cls}`}>
          <badge.Icon className="h-3 w-3" />
          {badge.label}
        </Badge>
      )}
      <h3 className="font-semibold text-base leading-snug">{title}</h3>

      <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
        {summary}
      </p>

      <div className="flex items-center justify-between gap-2 mt-auto pt-2">
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
    </Card>
  );
};
