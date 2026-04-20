import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type IranStatRow = Tables<"iran_stats">;

export function useIranStats() {
  const qc = useQueryClient();

  const query = useQuery<IranStatRow[]>({
    queryKey: ["iran-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.from("iran_stats").select("*");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const ch = supabase
      .channel("iran_stats_rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "iran_stats" },
        () => qc.invalidateQueries({ queryKey: ["iran-stats"] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  return query;
}
