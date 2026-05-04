import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { Header } from "@/components/Header";
import { ElectricityNewsCard } from "@/components/ElectricityNewsCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Zap } from "lucide-react";
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

const fetchNewsPage = async (pageIndex: number): Promise<ElectricityNewsRow[]> => {
  // Sort theo crawled_at DESC để bài "mới tìm thấy" (mới về DB) lên đầu —
  // user feedback: muốn thấy ngay tin mới crawl, kể cả bài có publish_at lùi
  // vài ngày (vd Mac Mini cào báo cũ vẫn coi là "mới với mình"). Dedup
  // url_hash đảm bảo không re-insert nên crawled_at là 1-time event.
  const threshold = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const from = pageIndex * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const { data, error } = await supabase
    .from("electricity_news" as never)
    .select("id, title, summary, original_url, published_at, crawled_at")
    .is("is_duplicate_of", null)
    .gte("crawled_at", threshold)
    .order("crawled_at", { ascending: false })
    .range(from, to);
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

  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["electricity-news"],
    queryFn: ({ pageParam }) => fetchNewsPage(pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < PAGE_SIZE ? undefined : allPages.length,
    refetchInterval: 5 * 60 * 1000,
  });

  const allRows = data?.pages.flat() ?? [];
  const isEmpty = !isLoading && allRows.length === 0;

  // Sentinel cuối list: vào viewport (rootMargin 600px) → fetchNextPage.
  // Margin lớn để load trước khi user thực sự chạm đáy, tránh giật.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage || isFetchingNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) fetchNextPage();
      },
      { rootMargin: "600px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

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

      <main className="w-full max-w-2xl mx-auto px-4 py-4">
        {isError && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>Lỗi tải tin: {(error as Error).message}</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
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
            <div className="border rounded-lg overflow-hidden bg-card divide-y divide-gray-200">
              {allRows.map((item) => (
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
            <div ref={sentinelRef} className="flex justify-center py-6">
              {isFetchingNextPage && (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              )}
              {!hasNextPage && allRows.length > 0 && (
                <p className="text-sm text-muted-foreground">Đã hết tin trong {RECENT_DAYS} ngày qua</p>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default ElectricityNews;
