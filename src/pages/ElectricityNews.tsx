import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { Header } from "@/components/Header";
import { ElectricityNewsCard } from "@/components/ElectricityNewsCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Zap } from "lucide-react";
import { getRelativeTime } from "@/lib/dateUtils";

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
    .is("is_duplicate_of", null)
    .or(`published_at.gte.${threshold},and(published_at.is.null,crawled_at.gte.${threshold})`)
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("crawled_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as ElectricityNewsRow[];
};

// Khi /d trống, fetch thời điểm crawl gần nhất để user phân biệt "hệ thống chưa kịp"
// vs "cron đứng nhiều giờ" (signal điều tra ở /ddashboard).
const fetchLastCrawled = async (): Promise<string | null> => {
  const { data, error } = await supabase
    .from("electricity_sources" as never)
    .select("last_crawled_at")
    .order("last_crawled_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as { last_crawled_at: string | null } | null)?.last_crawled_at ?? null;
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

  const isEmpty = !isLoading && (!data || data.length === 0);
  const { data: lastCrawled } = useQuery({
    queryKey: ["electricity-last-crawled"],
    queryFn: fetchLastCrawled,
    enabled: isEmpty,
    staleTime: 60 * 1000,
  });
  const lastCrawledAgeMs = lastCrawled ? Date.now() - new Date(lastCrawled).getTime() : null;
  const isStale = lastCrawledAgeMs != null && lastCrawledAgeMs > 60 * 60 * 1000; // >1h coi như stuck

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
        ) : isEmpty ? (
          <div className="text-center py-16 text-muted-foreground">
            <Zap className={`h-12 w-12 mx-auto mb-3 ${isStale ? "text-orange-500 opacity-80" : "opacity-40"}`} />
            <p className="mb-2">Chưa có tin nào trong {RECENT_DAYS} ngày qua.</p>
            {lastCrawled ? (
              <p className="text-sm">
                Lần crawl gần nhất:{" "}
                <span className={isStale ? "text-orange-600 font-semibold" : ""}>
                  {getRelativeTime(lastCrawled)}
                </span>
                {isStale && " — có thể cron đang đứng."}
              </p>
            ) : (
              <p className="text-sm">Hệ thống đang cập nhật, vui lòng quay lại sau.</p>
            )}
            <p className="text-sm mt-2">
              <Link to="/ddashboard" className="text-primary hover:underline">
                Xem chi tiết trạng thái nguồn →
              </Link>
            </p>
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
