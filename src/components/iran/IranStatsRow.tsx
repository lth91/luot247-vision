import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Crosshair, HeartPulse, Handshake, Clock } from "lucide-react";
import { useIranStats, type IranStatRow } from "@/hooks/useIranStats";
import { useEffect, useState } from "react";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "crosshair": Crosshair,
  "heart-pulse": HeartPulse,
  "handshake": Handshake,
  "clock": Clock,
};

function formatValue(row: IranStatRow): string {
  if (row.stat_key === "last_update_unix") {
    const secs = Number(row.stat_value);
    if (!secs) return "—";
    const diff = Math.max(0, Math.floor(Date.now() / 1000) - secs);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  }
  return Number(row.stat_value).toLocaleString();
}

export function IranStatsRow() {
  const { data, isLoading } = useIranStats();
  const [tick, setTick] = useState(0);

  // Re-render every 15s để "last update" tự refresh text "xs ago"
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
      </div>
    );
  }

  const order = ["strikes_total", "casualties_reported", "diplomacy_events", "last_update_unix"];
  const sorted = order
    .map(k => data.find(r => r.stat_key === k))
    .filter((r): r is IranStatRow => !!r);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-tick={tick}>
      {sorted.map(row => {
        const Icon = ICONS[row.icon ?? ""] ?? Clock;
        return (
          <Card key={row.stat_key} className="p-4 flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 text-primary p-2">
              <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground truncate">{row.label ?? row.stat_key}</div>
              <div className="text-xl font-bold tabular-nums truncate">{formatValue(row)}</div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
