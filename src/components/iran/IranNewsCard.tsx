import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";
import type { IranNewsRow } from "@/hooks/useIranNews";

function timeAgo(iso: string): string {
  const diff = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const SEVERITY_COLOR: Record<number, string> = {
  5: "bg-red-600 text-white",
  4: "bg-orange-500 text-white",
  3: "bg-amber-500 text-white",
  2: "bg-blue-500 text-white",
  1: "bg-slate-400 text-white",
  0: "bg-muted text-muted-foreground",
};

const CATEGORY_LABEL: Record<string, string> = {
  strike: "Strike",
  casualty: "Casualty",
  diplomacy: "Diplomacy",
  statement: "Statement",
  other: "Other",
};

export function IranNewsCard({ row }: { row: IranNewsRow }) {
  const sev = row.severity ?? 0;
  return (
    <a
      href={row.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block group"
    >
      <Card className="p-4 hover:border-primary/50 hover:shadow-md transition-all">
        <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
          <Badge variant="secondary" className="text-[10px] uppercase">
            {row.source_name ?? row.source}
          </Badge>
          {row.category && (
            <Badge className={`text-[10px] ${SEVERITY_COLOR[sev] ?? SEVERITY_COLOR[0]}`}>
              {CATEGORY_LABEL[row.category] ?? row.category}
            </Badge>
          )}
          <span className="ml-auto tabular-nums">{timeAgo(row.published_at)}</span>
        </div>
        <h3 className="font-semibold leading-snug group-hover:text-primary line-clamp-2">
          {row.title}
        </h3>
        {row.description && (
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
            {row.description}
          </p>
        )}
        <div className="flex items-center gap-1 mt-2 text-xs text-primary/80">
          <ExternalLink className="w-3 h-3" />
          <span className="truncate">{new URL(row.url).host}</span>
        </div>
      </Card>
    </a>
  );
}
