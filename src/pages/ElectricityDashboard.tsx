import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { Header } from "@/components/Header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, XCircle, AlertCircle, Activity } from "lucide-react";
import { getRelativeTime } from "@/lib/dateUtils";

type Source = {
  id: string;
  name: string;
  category: "co-quan" | "doanh-nghiep" | "bao-chi";
  is_active: boolean;
  consecutive_failures: number;
  last_crawled_at: string | null;
  last_error: string | null;
  list_url: string;
};

type News = {
  id: string;
  source_name: string;
  source_category: string | null;
  published_at: string | null;
  crawled_at: string;
};

const CATEGORY_LABEL: Record<string, string> = {
  "co-quan": "Cơ quan",
  "doanh-nghiep": "Doanh nghiệp",
  "bao-chi": "Báo chí",
};

const fetchSources = async (): Promise<Source[]> => {
  const { data, error } = await supabase
    .from("electricity_sources" as never)
    .select("id, name, category, is_active, consecutive_failures, last_crawled_at, last_error, list_url")
    .order("last_crawled_at", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as unknown as Source[];
};

const fetchNews = async (): Promise<News[]> => {
  const { data, error } = await supabase
    .from("electricity_news" as never)
    .select("id, source_name, source_category, published_at, crawled_at")
    .order("crawled_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return (data ?? []) as unknown as News[];
};

const ElectricityDashboard = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user) {
      supabase.from("user_roles").select("role").eq("user_id", session.user.id).maybeSingle()
        .then(({ data }) => setUserRole(data?.role || null));
    } else setUserRole(null);
  }, [session]);

  const { data: sources, isLoading: lSrc } = useQuery({
    queryKey: ["d-dashboard-sources"],
    queryFn: fetchSources,
    refetchInterval: 60 * 1000,
  });
  const { data: news, isLoading: lNews } = useQuery({
    queryKey: ["d-dashboard-news"],
    queryFn: fetchNews,
    refetchInterval: 60 * 1000,
  });

  const lastCrawled = useMemo(() => {
    return sources?.reduce<string | null>((acc, s) => {
      if (!s.last_crawled_at) return acc;
      return !acc || s.last_crawled_at > acc ? s.last_crawled_at : acc;
    }, null) ?? null;
  }, [sources]);

  // Cửa sổ 10 phút lùi từ lần crawl gần nhất, gom trọn 1 batch cron.
  const lastBatchCutoffMs = useMemo(() => {
    if (!lastCrawled) return null;
    return new Date(lastCrawled).getTime() - 10 * 60 * 1000;
  }, [lastCrawled]);

  const newsBySource = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of news ?? []) m.set(n.source_name, (m.get(n.source_name) ?? 0) + 1);
    return m;
  }, [news]);

  const lastBatchBySource = useMemo(() => {
    const m = new Map<string, number>();
    if (lastBatchCutoffMs == null) return m;
    for (const n of news ?? []) {
      if (new Date(n.crawled_at).getTime() >= lastBatchCutoffMs) {
        m.set(n.source_name, (m.get(n.source_name) ?? 0) + 1);
      }
    }
    return m;
  }, [news, lastBatchCutoffMs]);

  const overview = useMemo(() => {
    const total = sources?.length ?? 0;
    const active = sources?.filter((s) => s.is_active).length ?? 0;
    const failing = sources?.filter((s) => s.is_active && s.consecutive_failures > 0).length ?? 0;
    const inactive = sources?.filter((s) => !s.is_active).length ?? 0;
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const totalNews = news?.length ?? 0;
    const news24h = news?.filter((n) => now - new Date(n.published_at ?? n.crawled_at).getTime() < day).length ?? 0;
    const news7d = news?.filter((n) => now - new Date(n.published_at ?? n.crawled_at).getTime() < 7 * day).length ?? 0;
    const lastBatchNews = lastBatchCutoffMs == null
      ? 0
      : (news?.filter((n) => new Date(n.crawled_at).getTime() >= lastBatchCutoffMs).length ?? 0);
    return { total, active, failing, inactive, totalNews, news24h, news7d, lastCrawled, lastBatchNews };
  }, [sources, news, lastCrawled, lastBatchCutoffMs]);

  const sortedSources = useMemo(() => {
    if (!sources) return [];
    return [...sources].sort((a, b) => {
      if (!a.is_active && b.is_active) return 1;
      if (a.is_active && !b.is_active) return -1;
      if (a.consecutive_failures > 0 && b.consecutive_failures === 0) return -1;
      if (a.consecutive_failures === 0 && b.consecutive_failures > 0) return 1;
      const bn = newsBySource.get(b.name) ?? 0;
      const an = newsBySource.get(a.name) ?? 0;
      return bn - an;
    });
  }, [sources, newsBySource]);

  const isLoading = lSrc || lNews;

  return (
    <div className="min-h-screen bg-background">
      <Header user={session?.user} userRole={userRole} />

      <main className="container mx-auto px-4 py-6 max-w-6xl">
        <div className="mb-6 flex items-center gap-3">
          <Activity className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Dashboard /d</h1>
            <p className="text-sm text-muted-foreground">
              Theo dõi hoạt động crawl tin ngành điện. Tự refresh mỗi 60 giây.
              {overview.lastCrawled && (
                <>
                  {" "}Lần crawl gần nhất: <strong>{getRelativeTime(overview.lastCrawled)}</strong>
                  {" "}· <strong className="text-green-700">+{overview.lastBatchNews}</strong> tin mới.
                </>
              )}
            </p>
          </div>
        </div>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Tổng nguồn</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{overview.total}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Active</CardTitle></CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{overview.active}</div>
              {overview.failing > 0 && <div className="text-xs text-orange-500">{overview.failing} đang lỗi</div>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Bị disable</CardTitle></CardHeader>
            <CardContent><div className={`text-2xl font-bold ${overview.inactive > 0 ? "text-red-600" : ""}`}>{overview.inactive}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Tổng tin</CardTitle></CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{overview.totalNews}</div>
              <div className="text-xs text-muted-foreground">{overview.news24h} / 24h · {overview.news7d} / 7d</div>
            </CardContent>
          </Card>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">Chi tiết nguồn</h2>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">Trạng thái</th>
                    <th className="px-3 py-2 font-medium">Nguồn</th>
                    <th className="px-3 py-2 font-medium">Nhóm</th>
                    <th className="px-3 py-2 font-medium text-right">Tin</th>
                    <th className="px-3 py-2 font-medium text-right">Mới</th>
                    <th className="px-3 py-2 font-medium">Crawl gần nhất</th>
                    <th className="px-3 py-2 font-medium">Lỗi</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSources.map((s) => {
                    const count = newsBySource.get(s.name) ?? 0;
                    const lastBatchCount = lastBatchBySource.get(s.name) ?? 0;
                    const status = !s.is_active
                      ? { icon: <XCircle className="h-4 w-4 text-red-500" />, label: "Disabled", cls: "text-red-600" }
                      : s.consecutive_failures > 0
                      ? { icon: <AlertCircle className="h-4 w-4 text-orange-500" />, label: `Fail ${s.consecutive_failures}×`, cls: "text-orange-600" }
                      : { icon: <CheckCircle2 className="h-4 w-4 text-green-600" />, label: "OK", cls: "text-green-700" };
                    return (
                      <tr key={s.id} className="border-t hover:bg-muted/30">
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 ${status.cls}`}>
                            {status.icon}<span className="text-xs">{status.label}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2 font-medium">{s.name}</td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className="font-normal">{CATEGORY_LABEL[s.category] ?? s.category}</Badge>
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{count}</td>
                        <td className="px-3 py-2 text-right font-mono">
                          {lastBatchCount > 0 ? (
                            <span className="text-green-700 font-semibold">+{lastBatchCount}</span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {s.last_crawled_at ? getRelativeTime(s.last_crawled_at) : "—"}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground max-w-sm truncate" title={s.last_error ?? ""}>
                          {s.last_error ?? ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default ElectricityDashboard;
