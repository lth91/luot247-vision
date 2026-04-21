import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { Header } from "@/components/Header";
import { ElectricityNewsCard } from "@/components/ElectricityNewsCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RefreshCw, Search, Zap } from "lucide-react";
import { toast } from "sonner";
import { getRelativeTime } from "@/lib/dateUtils";

type ElectricityNewsRow = {
  id: string;
  source_name: string;
  source_category: string | null;
  title: string;
  summary: string;
  original_url: string;
  published_at: string | null;
  crawled_at: string;
  summary_word_count: number | null;
};

const PAGE_SIZE = 30;
const CATEGORY_OPTIONS = [
  { key: "all", label: "Tất cả" },
  { key: "co-quan", label: "Cơ quan" },
  { key: "doanh-nghiep", label: "Doanh nghiệp" },
  { key: "bao-chi", label: "Báo chí" },
] as const;

const fetchNews = async (limit: number): Promise<ElectricityNewsRow[]> => {
  const { data, error } = await supabase
    .from("electricity_news" as never)
    .select("id, source_name, source_category, title, summary, original_url, published_at, crawled_at, summary_word_count")
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("crawled_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as ElectricityNewsRow[];
};

const ElectricityNews = () => {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [category, setCategory] = useState<(typeof CATEGORY_OPTIONS)[number]["key"]>("all");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

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

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.filter((item) => {
      if (category !== "all" && item.source_category !== category) return false;
      if (q) {
        const hay = `${item.title} ${item.summary} ${item.source_name}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, category, search]);

  const lastCrawled = data && data.length > 0 ? data[0].crawled_at : null;

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const { error } = await supabase.functions.invoke("crawl-electricity-news");
      if (error) {
        toast.error(`Lỗi: ${error.message}`);
      } else {
        toast.success("Đã kích hoạt crawl. Đợi ~30 giây rồi tải lại.");
        setTimeout(() => qc.invalidateQueries({ queryKey: ["electricity-news"] }), 5000);
      }
    } catch (e) {
      toast.error(`Lỗi: ${(e as Error).message}`);
    } finally {
      setRefreshing(false);
    }
  };

  const stats = useMemo(() => {
    if (!data) return { total: 0, today: 0, week: 0 };
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    let today = 0;
    let week = 0;
    for (const n of data) {
      const t = new Date(n.published_at ?? n.crawled_at).getTime();
      if (now - t < dayMs) today++;
      if (now - t < 7 * dayMs) week++;
    }
    return { total: data.length, today, week };
  }, [data]);

  return (
    <div className="min-h-screen bg-background">
      <Header user={session?.user} userRole={userRole} />

      <main className="container mx-auto px-4 py-6 max-w-6xl">
        <section className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Zap className="h-7 w-7 text-yellow-500" />
            <h1 className="text-2xl md:text-3xl font-bold">Tin ngành điện Việt Nam</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            AI agent tổng hợp và tóm tắt tin tức ngành điện từ 27 nguồn. Cập nhật mỗi giờ.
            {lastCrawled && <> Cập nhật gần nhất: <strong>{getRelativeTime(lastCrawled)}</strong>.</>}
          </p>
        </section>

        <section className="mb-6 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            {CATEGORY_OPTIONS.map((opt) => (
              <Badge
                key={opt.key}
                variant={category === opt.key ? "default" : "outline"}
                className="cursor-pointer px-3 py-1"
                onClick={() => setCategory(opt.key)}
              >
                {opt.label}
              </Badge>
            ))}
          </div>
          <div className="flex gap-2 items-center">
            <div className="relative flex-1 md:w-64">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Tìm theo tiêu đề, nội dung, nguồn..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              disabled={refreshing}
              title="Crawl thủ công"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </section>

        <section className="mb-4 flex gap-4 text-sm text-muted-foreground">
          <span>Tổng: <strong className="text-foreground">{stats.total}</strong></span>
          <span>24h qua: <strong className="text-foreground">{stats.today}</strong></span>
          <span>7 ngày: <strong className="text-foreground">{stats.week}</strong></span>
          {filtered.length !== (data?.length ?? 0) && (
            <span>Lọc: <strong className="text-foreground">{filtered.length}</strong></span>
          )}
        </section>

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
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Zap className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="mb-2">Chưa có tin nào khớp.</p>
            <p className="text-sm">
              {data && data.length === 0
                ? "Hệ thống chưa crawl lần nào. Bấm nút làm mới để chạy ngay."
                : "Thử bỏ bộ lọc hoặc từ khóa khác."}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((item) => (
                <ElectricityNewsCard
                  key={item.id}
                  title={item.title}
                  summary={item.summary}
                  sourceName={item.source_name}
                  sourceCategory={item.source_category}
                  originalUrl={item.original_url}
                  publishedAt={item.published_at}
                  crawledAt={item.crawled_at}
                />
              ))}
            </div>
            {data && data.length >= limit && (
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
