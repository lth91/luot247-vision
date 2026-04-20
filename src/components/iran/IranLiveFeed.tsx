import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Radio } from "lucide-react";
import { useIranNews } from "@/hooks/useIranNews";
import { IranNewsCard } from "./IranNewsCard";
import { IranSourceFilter } from "./IranSourceFilter";

export function IranLiveFeed() {
  const [source, setSource] = useState<string | null>(null);
  const { data, isLoading, isFetching, dataUpdatedAt } = useIranNews(source, 80);

  return (
    <Card className="p-4 flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Radio
            className={`w-4 h-4 ${isFetching ? "text-red-500 animate-pulse" : "text-red-500"}`}
          />
          <span className="font-semibold text-sm">LIVE feed</span>
          <span className="text-xs text-muted-foreground">
            {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : ""}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          {data?.length ?? 0} articles
        </span>
      </div>

      <IranSourceFilter value={source} onChange={setSource} />

      <ScrollArea className="mt-3 flex-1 pr-2">
        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : (data?.length ?? 0) === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-12">
            No articles yet. Waiting for the cron to fetch sources…
          </div>
        ) : (
          <div className="space-y-2">
            {data!.map(row => (
              <IranNewsCard key={row.id} row={row} />
            ))}
          </div>
        )}
      </ScrollArea>
    </Card>
  );
}
