import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type IranNewsRow = Tables<"news_iran">;

export function useIranNews(source?: string | null, limit = 80) {
  const qc = useQueryClient();

  const query = useQuery<IranNewsRow[]>({
    queryKey: ["iran-news", source ?? "all", limit],
    queryFn: async () => {
      let q = supabase
        .from("news_iran")
        .select("*")
        .order("published_at", { ascending: false })
        .limit(limit);
      if (source) q = q.eq("source", source);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 20_000,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const ch = supabase
      .channel("news_iran_rt")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "news_iran" },
        () => qc.invalidateQueries({ queryKey: ["iran-news"] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  return query;
}
