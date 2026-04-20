import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type IranEventRow = Tables<"iran_events">;

export function useIranEvents(limit = 30) {
  const qc = useQueryClient();

  const query = useQuery<IranEventRow[]>({
    queryKey: ["iran-events", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("iran_events")
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  useEffect(() => {
    const ch = supabase
      .channel("iran_events_rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "iran_events" },
        () => qc.invalidateQueries({ queryKey: ["iran-events"] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  return query;
}
