import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { Header } from "@/components/Header";
import { ElectricityNewsCard } from "@/components/ElectricityNewsCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Zap } from "lucide-react";

type ElectricityNewsRow = {
  id: string;
  title: string;
  summary: string;
  original_url: string;
  published_at: string | null;
  crawled_at: string;
};

const PAGE_SIZE = 30;
const RECENT_DAYS = 3;

const fetchNews = async (limit: number): Promise<ElectricityNewsRow[]> => {
  const threshold = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("electricity_news" as never)
    .select("id, title, summary, original_url, published_at, crawled_at")
    .or(`published_at.gte.${threshold},and(published_at.is.null,crawled_at.gte.${threshold})`)
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("crawled_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as ElectricityNewsRow[];
};

const ElectricityNews = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user) {
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .maybeSingle()
        .then(({ data }) => setUserRole(data?.role || null));
    } else {
      setUserRole(null);
    }
  }, [session]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["electricity-news", limit],
    queryFn: () => fetchNews(limit),
    refetchInterval: 5 * 60 * 1000,
  });

  return (
    <div className="min-h-screen bg-background">
      <Header user={session?.user} userRole={userRole} />

      <main className="container mx-auto px-4 py-6 max-w-6xl">
        {isError && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>Lỗi tải tin: {(error as Error).message}</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-56 w-full" />
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Zap className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="mb-2">Chưa có tin nào.</p>
            <p className="text-sm">Hệ thống đang cập nhật, vui lòng quay lại sau.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.map((item) => (
                <ElectricityNewsCard
                  key={item.id}
                  title={item.title}
                  summary={item.summary}
                  originalUrl={item.original_url}
                  publishedAt={item.published_at}
                  crawledAt={item.crawled_at}
                />
              ))}
            </div>
            {data.length >= limit && (
              <div className="flex justify-center mt-6">
                <Button variant="outline" onClick={() => setLimit(limit + PAGE_SIZE)}>
                  Tải thêm
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default ElectricityNews;
