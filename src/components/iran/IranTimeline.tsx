import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock } from "lucide-react";
import { useIranEvents } from "@/hooks/useIranEvents";

const DOT_COLOR: Record<number, string> = {
  5: "bg-red-600 ring-red-600/30",
  4: "bg-orange-500 ring-orange-500/30",
  3: "bg-amber-500 ring-amber-500/30",
  2: "bg-blue-500 ring-blue-500/30",
  1: "bg-slate-400 ring-slate-400/30",
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

export function IranTimeline() {
  const { data, isLoading } = useIranEvents(30);

  return (
    <Card className="p-4 flex flex-col h-full">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-4 h-4 text-primary" />
        <span className="font-semibold text-sm">Timeline (24h)</span>
      </div>

      <ScrollArea className="flex-1 pr-2">
        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}
          </div>
        ) : (data?.length ?? 0) === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-12">
            No events yet.
          </div>
        ) : (
          <ol className="relative border-l border-border ml-2 space-y-4">
            {data!.map(ev => {
              const color = DOT_COLOR[ev.severity ?? 1] ?? DOT_COLOR[1];
              return (
                <li key={ev.id} className="ml-4">
                  <span
                    className={`absolute -left-[5px] w-2.5 h-2.5 rounded-full ring-4 ${color}`}
                    aria-hidden
                  />
                  <div className="text-[11px] text-muted-foreground tabular-nums">
                    {fmtDay(ev.occurred_at)} · {fmtTime(ev.occurred_at)}
                  </div>
                  <div className="text-sm font-medium leading-snug line-clamp-3">
                    {ev.title}
                  </div>
                  {ev.location_name && (
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {ev.location_name}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </ScrollArea>
    </Card>
  );
}
