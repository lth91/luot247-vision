import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { Header } from "@/components/Header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  CheckCircle2,
  AlertCircle,
  Activity,
  AlertTriangle,
  PauseCircle,
  CircleDot,
} from "lucide-react";
import { getRelativeTime } from "@/lib/dateUtils";

type Source = {
  id: string;
  name: string;
  category: "co-quan" | "doanh-nghiep" | "bao-chi";
  tier: number;
  is_active: boolean;
  consecutive_failures: number;
  last_crawled_at: string | null;
  last_error: string | null;
  list_url: string;
  base_url: string;
  feed_type: string;
};

type News = {
  id: string;
  source_name: string;
  source_domain: string | null;
  source_category: string | null;
  published_at: string | null;
  crawled_at: string;
  original_url: string;
  title: string;
};

const CATEGORY_LABEL: Record<string, string> = {
  "co-quan": "Cơ quan",
  "doanh-nghiep": "Doanh nghiệp",
  "bao-chi": "Báo chí",
};

const TIER_LABEL: Record<number, { label: string; cls: string }> = {
  1: { label: "T1 Chính thức", cls: "border-blue-200 bg-blue-50 text-blue-700" },
  2: { label: "T2 Chuyên ngành", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  3: { label: "T3 Báo chí", cls: "border-slate-200 bg-slate-50 text-slate-600" },
  4: { label: "T4 Tổng hợp", cls: "border-amber-200 bg-amber-50 text-amber-700" },
};

const DAY = 24 * 60 * 60 * 1000;

function getHost(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function classifyDisabledReason(s: Source): {
  key: "handover" | "off-topic" | "hard-fail" | "anti-bot" | "unknown";
  label: string;
  cls: string;
} {
  const err = s.last_error ?? "";
  if (/Mac Mini Scraper|handled by Mac Mini|auto-handover.*Mac Mini/i.test(err))
    return { key: "handover", label: "Handover Mac Mini", cls: "border-blue-200 bg-blue-50 text-blue-700" };
  if (/off.topic|redundant|RSS Discovery covers|list_url là trang chủ|misconfigured/i.test(err))
    return { key: "off-topic", label: "Off-topic", cls: "border-amber-200 bg-amber-50 text-amber-700" };
  if (/Edge IP|anti-bot|HTTP 403|D1N|JS-rendered/i.test(err))
    return { key: "anti-bot", label: "Anti-bot / JS-render", cls: "border-orange-200 bg-orange-50 text-orange-700" };
  if (/aborted|Connection reset|signal|HTTP 5\d{2}|timeout|fetch failed/i.test(err))
    return { key: "hard-fail", label: "Hard fail", cls: "border-red-200 bg-red-50 text-red-700" };
  return { key: "unknown", label: "Unknown", cls: "border-slate-200 bg-slate-50 text-slate-600" };
}

const fetchSources = async (): Promise<Source[]> => {
  const { data, error } = await supabase
    .from("electricity_sources" as never)
    .select(
      "id, name, category, tier, is_active, consecutive_failures, last_crawled_at, last_error, list_url, base_url, feed_type"
    )
    .order("last_crawled_at", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as unknown as Source[];
};

const fetchCandidates = async (): Promise<SourceCandidate[]> => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("source_candidate_log" as never)
    .select("id, domain, status, sample_count, decision_reason, query_seed, discovered_at, inserted_source_id")
    .gte("discovered_at", since)
    .order("discovered_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as unknown as SourceCandidate[];
};

const fetchSelectorFixes = async (): Promise<SelectorFix[]> => {
  const { data, error } = await supabase
    .from("selector_fix_log" as never)
    .select("id, source_name, attempted_at, old_pattern, new_pattern, llm_confidence, llm_reason, test_match_count, applied, result")
    .order("attempted_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as unknown as SelectorFix[];
};

const fetchNews = async (): Promise<News[]> => {
  // Lấy 30 ngày để đảm bảo Mac Mini hosts produce tuần trước vẫn nằm trong window.
  // Trước đây limit 1500 newest theo crawled_at — Edge crawler chạy hàng giờ tạo
  // nhiều row mới đẩy bài Mac Mini cũ ra khỏi window, khiến status hiển thị
  // "pending" sai cho host đang produce.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("electricity_news" as never)
    .select("id, source_name, source_domain, source_category, published_at, crawled_at, original_url, title")
    .gte("crawled_at", since)
    .order("crawled_at", { ascending: false })
    .limit(5000);
  if (error) throw error;
  return (data ?? []) as unknown as News[];
};

type TabKey = "edge" | "mac-mini" | "rss-discovery" | "disabled" | "ai-agents";

type SourceCandidate = {
  id: string;
  domain: string;
  status: string;
  sample_count: number;
  decision_reason: string | null;
  query_seed: string | null;
  discovered_at: string;
  inserted_source_id: string | null;
};

type SelectorFix = {
  id: string;
  source_name: string;
  attempted_at: string;
  old_pattern: string | null;
  new_pattern: string | null;
  llm_confidence: number | null;
  llm_reason: string | null;
  test_match_count: number | null;
  applied: boolean;
  result: string | null;
};

const CANDIDATE_STATUS: Record<string, { label: string; cls: string }> = {
  added: { label: "Đã add (RSS)", cls: "bg-green-100 text-green-800 border-green-200" },
  added_playwright_pending: { label: "Handover Mac Mini ⏳", cls: "bg-violet-100 text-violet-800 border-violet-200" },
  rejected_existing: { label: "Đã có sẵn", cls: "bg-slate-100 text-slate-700 border-slate-200" },
  rejected_low_count: { label: "Sample thấp", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  rejected_no_rss: { label: "Không có RSS", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  rejected_anti_bot: { label: "Anti-bot", cls: "bg-orange-100 text-orange-800 border-orange-200" },
  rejected_probe_fail: { label: "Probe fail", cls: "bg-red-100 text-red-800 border-red-200" },
  rejected_daily_limit: { label: "Hết quota ngày", cls: "bg-blue-100 text-blue-800 border-blue-200" },
};

const QUERY_SEED_LABEL: Record<string, string> = {
  utility: "EVN/lưới",
  renewable: "tái tạo",
  policy: "chính sách",
  operations: "vận hành",
  corporates: "doanh nghiệp",
};

const ElectricityDashboard = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("edge");
  const [flashAnchor, setFlashAnchor] = useState<string | null>(null);
  const [showBatch, setShowBatch] = useState(false);

  useEffect(() => {
    if (!flashAnchor) return;
    const t = setTimeout(() => setFlashAnchor(null), 2000);
    return () => clearTimeout(t);
  }, [flashAnchor]);

  const jumpTo = (tab: TabKey, anchor: string) => {
    setActiveTab(tab);
    setFlashAnchor(anchor);
    setTimeout(() => {
      document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
  };

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
  const { data: candidates } = useQuery({
    queryKey: ["d-dashboard-candidates"],
    queryFn: fetchCandidates,
    refetchInterval: 5 * 60 * 1000,
  });
  const { data: selectorFixes } = useQuery({
    queryKey: ["d-dashboard-selector-fixes"],
    queryFn: fetchSelectorFixes,
    refetchInterval: 5 * 60 * 1000,
  });

  const candidateStats = useMemo(() => {
    const byStatus = new Map<string, number>();
    let last7d = 0;
    let added7d = 0;
    let latest: string | null = null;
    const sevenDaysAgo = Date.now() - 7 * DAY;
    for (const c of candidates ?? []) {
      byStatus.set(c.status, (byStatus.get(c.status) ?? 0) + 1);
      const t = new Date(c.discovered_at).getTime();
      if (t >= sevenDaysAgo) {
        last7d += 1;
        if (c.status === "added" || c.status === "added_playwright_pending") added7d += 1;
      }
      if (!latest || c.discovered_at > latest) latest = c.discovered_at;
    }
    return { byStatus, last7d, added7d, latest };
  }, [candidates]);

  const lastCrawled = useMemo(() => {
    return sources?.reduce<string | null>((acc, s) => {
      if (!s.last_crawled_at) return acc;
      return !acc || s.last_crawled_at > acc ? s.last_crawled_at : acc;
    }, null) ?? null;
  }, [sources]);

  const lastBatchCutoffMs = useMemo(() => {
    if (!lastCrawled) return null;
    return new Date(lastCrawled).getTime() - 10 * 60 * 1000;
  }, [lastCrawled]);

  const newsBySource = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of news ?? []) m.set(n.source_name, (m.get(n.source_name) ?? 0) + 1);
    return m;
  }, [news]);

  const news24hBySource = useMemo(() => {
    const m = new Map<string, number>();
    const cutoff = Date.now() - DAY;
    for (const n of news ?? []) {
      const t = new Date(n.published_at ?? n.crawled_at).getTime();
      if (t >= cutoff) m.set(n.source_name, (m.get(n.source_name) ?? 0) + 1);
    }
    return m;
  }, [news]);

  const sevenDayCountsByName = useMemo(() => {
    const m = new Map<string, number[]>();
    if (!news) return m;
    const now = Date.now();
    for (const n of news) {
      const t = new Date(n.published_at ?? n.crawled_at).getTime();
      const ageMs = now - t;
      if (ageMs < 0 || ageMs >= 7 * DAY) continue;
      const idx = 6 - Math.floor(ageMs / DAY);
      const arr = m.get(n.source_name) ?? [0, 0, 0, 0, 0, 0, 0];
      arr[idx] += 1;
      m.set(n.source_name, arr);
    }
    return m;
  }, [news]);

  const sevenDayCountsByMacMiniHost = useMemo(() => {
    const m = new Map<string, number[]>();
    if (!news) return m;
    const now = Date.now();
    for (const n of news) {
      if (!n.source_name?.startsWith("Mac Mini")) continue;
      const nameMatch = n.source_name.match(/^Mac Mini \(([^)]+)\)$/);
      const host = nameMatch?.[1] ?? getHost(n.original_url);
      if (!host) continue;
      const t = new Date(n.published_at ?? n.crawled_at).getTime();
      const ageMs = now - t;
      if (ageMs < 0 || ageMs >= 7 * DAY) continue;
      const idx = 6 - Math.floor(ageMs / DAY);
      const arr = m.get(host) ?? [0, 0, 0, 0, 0, 0, 0];
      arr[idx] += 1;
      m.set(host, arr);
    }
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

  const macMiniHosts = useMemo(() => {
    if (!sources || !news) return [];
    const handoverHosts = new Set<string>();
    for (const s of sources) {
      const isHandover = !s.is_active && /Mac Mini Scraper/i.test(s.last_error ?? "");
      if (isHandover) {
        const h = getHost(s.base_url);
        if (h) handoverHosts.add(h);
      }
    }

    // Match cả "Mac Mini Scraper" (legacy flat naming) và "Mac Mini (host.tld)"
    // (per-host naming scraper.py mới). Derive host từ source_name regex hoặc
    // fallback sang original_url.
    const seen = new Map<string, { count: number; latest: string }>();
    for (const n of news) {
      if (!n.source_name?.startsWith("Mac Mini")) continue;
      const nameMatch = n.source_name.match(/^Mac Mini \(([^)]+)\)$/);
      const h = nameMatch?.[1] ?? getHost(n.original_url);
      if (!h) continue;
      const cur = seen.get(h) ?? { count: 0, latest: "" };
      cur.count += 1;
      if (n.crawled_at > cur.latest) cur.latest = n.crawled_at;
      seen.set(h, cur);
    }

    const allHosts = new Set<string>([...handoverHosts, ...seen.keys()]);
    const sevenDaysAgoMs = Date.now() - 7 * DAY;
    return Array.from(allHosts)
      .map((host) => {
        const stats = seen.get(host);
        const isProducing = stats != null && new Date(stats.latest).getTime() > sevenDaysAgoMs;
        const status: "producing" | "silent" | "pending" =
          stats == null ? "pending" : isProducing ? "producing" : "silent";
        return {
          host,
          count: stats?.count ?? 0,
          latest: stats?.latest ?? null,
          status,
        };
      })
      .sort((a, b) => {
        const order = { producing: 0, silent: 1, pending: 2 } as const;
        if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
        return b.count - a.count;
      });
  }, [sources, news]);

  const discoveryBreakdown = useMemo(() => {
    const m = new Map<string, { count: number; latest: string }>();
    for (const n of news ?? []) {
      if (n.source_name !== "RSS Discovery" || !n.source_domain) continue;
      const cur = m.get(n.source_domain) ?? { count: 0, latest: "" };
      cur.count += 1;
      if (n.crawled_at > cur.latest) cur.latest = n.crawled_at;
      m.set(n.source_domain, cur);
    }
    return Array.from(m.entries())
      .map(([domain, v]) => ({ domain, ...v }))
      .sort((a, b) => b.count - a.count);
  }, [news]);

  const edgeSources = useMemo(() => {
    if (!sources) return [];
    return sources
      .filter((s) => s.is_active && s.name !== "RSS Discovery" && s.name !== "Mac Mini Scraper")
      .sort((a, b) => {
        if (a.consecutive_failures > 0 && b.consecutive_failures === 0) return -1;
        if (a.consecutive_failures === 0 && b.consecutive_failures > 0) return 1;
        if (a.tier !== b.tier) return a.tier - b.tier;
        return (news24hBySource.get(b.name) ?? 0) - (news24hBySource.get(a.name) ?? 0);
      });
  }, [sources, news24hBySource]);

  const disabledGrouped = useMemo(() => {
    const groups: Record<string, Source[]> = {
      handover: [],
      "off-topic": [],
      "anti-bot": [],
      "hard-fail": [],
      unknown: [],
    };
    for (const s of sources ?? []) {
      if (s.is_active) continue;
      const r = classifyDisabledReason(s);
      groups[r.key].push(s);
    }
    return groups;
  }, [sources]);

  const actionItems = useMemo(() => {
    if (!sources || !news) return [];
    const items: {
      severity: "danger" | "warn";
      title: string;
      detail?: string;
      hint?: string;
      tab: TabKey;
      anchor: string;
    }[] = [];

    for (const s of sources) {
      if (s.is_active && s.consecutive_failures > 0) {
        items.push({
          severity: s.consecutive_failures >= 5 ? "danger" : "warn",
          title: `${s.name}: fail ${s.consecutive_failures}× liên tiếp`,
          hint: s.last_error?.slice(0, 100) ?? undefined,
          tab: "edge",
          anchor: `row-src-${s.id}`,
        });
      }
    }

    // Collapse Mac Mini issues: 1 dòng cho pending hosts, 1 dòng cho silent hosts.
    // Trước đây mỗi host 1 dòng → banner ngập 13+ entry trùng pattern.
    const pendingHosts = macMiniHosts.filter((h) => h.status === "pending");
    const silentHosts = macMiniHosts.filter((h) => h.status === "silent");

    if (pendingHosts.length > 0) {
      items.push({
        severity: "warn",
        title: `Mac Mini: ${pendingHosts.length} host claimed nhưng chưa produce bài`,
        detail: pendingHosts.map((h) => h.host).join(", "),
        hint: "Debug Playwright selector trong sources.py",
        tab: "mac-mini",
        anchor: `row-host-${pendingHosts[0].host}`,
      });
    }
    if (silentHosts.length > 0) {
      items.push({
        severity: "warn",
        title: `Mac Mini: ${silentHosts.length} host im lặng quá 7 ngày`,
        detail: silentHosts.map((h) => `${h.host} (${h.latest ? getRelativeTime(h.latest) : "—"})`).join(", "),
        hint: "Site có thể đổi structure, check selector",
        tab: "mac-mini",
        anchor: `row-host-${silentHosts[0].host}`,
      });
    }

    for (const s of sources) {
      if (s.is_active) continue;
      const r = classifyDisabledReason(s);
      if (r.key === "hard-fail") {
        items.push({
          severity: "warn",
          title: `${s.name}: disabled hard-fail, chưa có Mac Mini handover`,
          hint: s.last_error?.slice(0, 100) ?? undefined,
          tab: "disabled",
          anchor: `row-disabled-${s.id}`,
        });
      }
    }

    return items;
  }, [sources, news, macMiniHosts]);

  const lastBatchArticles = useMemo(() => {
    if (lastBatchCutoffMs == null) return [];
    return (news ?? [])
      .filter((n) => new Date(n.crawled_at).getTime() >= lastBatchCutoffMs)
      .sort((a, b) => (a.crawled_at < b.crawled_at ? 1 : -1));
  }, [news, lastBatchCutoffMs]);

  const overview = useMemo(() => {
    const total = sources?.length ?? 0;
    const active = sources?.filter((s) => s.is_active).length ?? 0;
    const handover = (disabledGrouped.handover ?? []).length;
    const disabledOther = total - active - handover;
    const totalNews = news?.length ?? 0;
    const now = Date.now();
    const news24h = news?.filter((n) => now - new Date(n.published_at ?? n.crawled_at).getTime() < DAY).length ?? 0;
    const news7d = news?.filter((n) => now - new Date(n.published_at ?? n.crawled_at).getTime() < 7 * DAY).length ?? 0;
    const lastBatchNews = lastBatchCutoffMs == null
      ? 0
      : (news?.filter((n) => new Date(n.crawled_at).getTime() >= lastBatchCutoffMs).length ?? 0);
    return { total, active, handover, disabledOther, totalNews, news24h, news7d, lastBatchNews };
  }, [sources, news, disabledGrouped, lastBatchCutoffMs]);

  // Breakdown of last 24h news by crawl method, for the donut/bar chart.
  const news24hByMethod = useMemo(() => {
    const cutoff = Date.now() - DAY;
    const counts = { edge: 0, "rss-discovery": 0, "mac-mini": 0 };
    for (const n of news ?? []) {
      const t = new Date(n.published_at ?? n.crawled_at).getTime();
      if (t < cutoff) continue;
      if (n.source_name === "RSS Discovery") counts["rss-discovery"]++;
      else if (n.source_name?.startsWith("Mac Mini")) counts["mac-mini"]++;
      else counts.edge++;
    }
    const total = counts.edge + counts["rss-discovery"] + counts["mac-mini"];
    return {
      ...counts,
      total,
      pct: total === 0
        ? { edge: 0, "rss-discovery": 0, "mac-mini": 0 }
        : {
            edge: Math.round((counts.edge / total) * 100),
            "rss-discovery": Math.round((counts["rss-discovery"] / total) * 100),
            "mac-mini": Math.round((counts["mac-mini"] / total) * 100),
          },
    };
  }, [news]);

  const isLoading = lSrc || lNews;

  return (
    <div className="min-h-screen bg-background">
      <Header user={session?.user} userRole={userRole} />

      <main className="container mx-auto px-4 py-6 max-w-6xl">
        <div className="mb-6 flex items-center gap-3">
          <Activity className="h-7 w-7 text-primary" />
          <div className="flex-1">
            <h1 className="text-2xl md:text-3xl font-bold">Dashboard /d</h1>
            <p className="text-sm text-muted-foreground">
              Theo dõi crawl tin ngành điện. Tự refresh mỗi 60 giây.
              {lastCrawled && (
                <>
                  {" "}Lần crawl gần nhất: <strong>{getRelativeTime(lastCrawled)}</strong>
                  {overview.lastBatchNews > 0 ? (
                    <>
                      {" "}·{" "}
                      <button
                        type="button"
                        onClick={() => setShowBatch((v) => !v)}
                        className="text-green-700 font-semibold hover:underline"
                      >
                        +{overview.lastBatchNews} tin mới {showBatch ? "▴" : "▾"}
                      </button>
                      .
                    </>
                  ) : (
                    " · 0 tin mới."
                  )}
                </>
              )}
            </p>
            {showBatch && lastBatchArticles.length > 0 && (
              <div className="mt-3 rounded-md border bg-muted/30 p-3 space-y-1.5">
                {lastBatchArticles.map((n) => (
                  <div key={n.id} className="text-sm flex items-start gap-2">
                    <Badge variant="outline" className="font-normal text-[10px] shrink-0 mt-0.5">
                      {n.source_name}
                    </Badge>
                    <a
                      href={n.original_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline flex-1"
                    >
                      {n.title}
                    </a>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {getRelativeTime(n.crawled_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {actionItems.length > 0 && (
          <Card className="mb-6 border-orange-200 bg-orange-50/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-orange-900">
                <AlertTriangle className="h-5 w-5" />
                Cần xử lý ({actionItems.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="space-y-1">
                {actionItems.map((it, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => jumpTo(it.tab, it.anchor)}
                      className="w-full text-left flex items-start gap-2 text-sm rounded-md px-2 py-1.5 hover:bg-orange-100/70 transition-colors"
                    >
                      <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${it.severity === "danger" ? "bg-red-500" : "bg-orange-400"}`} />
                      <div className="flex-1">
                        <div className="font-medium">{it.title}</div>
                        {it.detail && <div className="text-muted-foreground text-xs">{it.detail}</div>}
                        {it.hint && <div className="text-muted-foreground text-xs italic">→ {it.hint}</div>}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 self-center">↗</span>
                    </button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Tổng nguồn</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{overview.total}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Active</CardTitle></CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{overview.active}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Handover Mac Mini</CardTitle></CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{overview.handover}</div>
              <div className="text-xs text-muted-foreground">đã chuyển scraper</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Tin (24h / 7d / total)</CardTitle></CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{overview.news24h}</div>
              <div className="text-xs text-muted-foreground">{overview.news7d} / 7d · {overview.totalNews} total</div>
            </CardContent>
          </Card>
        </section>

        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Tin 24h theo crawler ({news24hByMethod.total} tin)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {news24hByMethod.total === 0 ? (
              <div className="text-sm text-muted-foreground">Chưa có tin trong 24h.</div>
            ) : (
              <>
                <BarRow label="Edge crawler" value={news24hByMethod.edge} pct={news24hByMethod.pct.edge} cls="bg-emerald-500" />
                <BarRow label="Mac Mini Playwright" value={news24hByMethod["mac-mini"]} pct={news24hByMethod.pct["mac-mini"]} cls="bg-blue-500" />
                <BarRow label="RSS Discovery" value={news24hByMethod["rss-discovery"]} pct={news24hByMethod.pct["rss-discovery"]} cls="bg-violet-500" />
              </>
            )}
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)} className="w-full">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 mb-4">
            <TabsTrigger value="edge">
              Edge ({edgeSources.length})
            </TabsTrigger>
            <TabsTrigger value="mac-mini">
              Mac Mini ({macMiniHosts.length})
            </TabsTrigger>
            <TabsTrigger value="rss-discovery">
              RSS Discovery ({discoveryBreakdown.length})
            </TabsTrigger>
            <TabsTrigger value="disabled">
              Disabled ({(sources?.filter((s) => !s.is_active).length) ?? 0})
            </TabsTrigger>
            <TabsTrigger value="ai-agents">
              🤖 AI Agents ({candidateStats.last7d + (selectorFixes?.length ?? 0)})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="edge">
            {isLoading ? (
              <SkeletonRows count={8} />
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-medium">Trạng thái</th>
                      <th className="px-3 py-2 font-medium">Nguồn</th>
                      <th className="px-3 py-2 font-medium">Tier</th>
                      <th className="px-3 py-2 font-medium">Loại</th>
                      <th className="px-3 py-2 font-medium">7 ngày</th>
                      <th className="px-3 py-2 font-medium text-right">24h</th>
                      <th className="px-3 py-2 font-medium text-right">Tổng</th>
                      <th className="px-3 py-2 font-medium text-right">Batch</th>
                      <th className="px-3 py-2 font-medium">Crawl</th>
                    </tr>
                  </thead>
                  <tbody>
                    {edgeSources.map((s) => {
                      const status = s.consecutive_failures > 0
                        ? { icon: <AlertCircle className="h-4 w-4 text-orange-500" />, label: `Fail ${s.consecutive_failures}×`, cls: "text-orange-600" }
                        : { icon: <CheckCircle2 className="h-4 w-4 text-green-600" />, label: "OK", cls: "text-green-700" };
                      const n24 = news24hBySource.get(s.name) ?? 0;
                      const total = newsBySource.get(s.name) ?? 0;
                      const batch = lastBatchBySource.get(s.name) ?? 0;
                      const counts = sevenDayCountsByName.get(s.name) ?? [0, 0, 0, 0, 0, 0, 0];
                      const anchor = `row-src-${s.id}`;
                      const flash = flashAnchor === anchor;
                      return (
                        <tr id={anchor} key={s.id} className={`border-t hover:bg-muted/30 transition-colors ${flash ? "bg-yellow-100" : ""}`}>
                          <td className="px-3 py-2">
                            <span className={`inline-flex items-center gap-1 ${status.cls}`} title={s.last_error ?? ""}>
                              {status.icon}<span className="text-xs">{status.label}</span>
                            </span>
                          </td>
                          <td className="px-3 py-2 font-medium">{s.name}</td>
                          <td className="px-3 py-2">
                            {TIER_LABEL[s.tier] && (
                              <Badge variant="outline" className={`font-normal text-xs ${TIER_LABEL[s.tier].cls}`}>
                                {TIER_LABEL[s.tier].label}
                              </Badge>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className="font-normal">{CATEGORY_LABEL[s.category] ?? s.category}</Badge>
                          </td>
                          <td className="px-3 py-2"><Sparkline counts={counts} /></td>
                          <td className="px-3 py-2 text-right font-mono">{n24}</td>
                          <td className="px-3 py-2 text-right font-mono text-muted-foreground">{total}</td>
                          <td className="px-3 py-2 text-right font-mono">
                            {batch > 0 ? <span className="text-green-700 font-semibold">+{batch}</span> : <span className="text-muted-foreground">0</span>}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground text-xs">
                            {s.last_crawled_at ? getRelativeTime(s.last_crawled_at) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="mac-mini">
            <div className="text-xs text-muted-foreground mb-2">
              Playwright scraper chạy trên Mac Mini (mỗi giờ phút :20, 7h-22h GMT+7).
              Producing = có bài trong 7 ngày · Silent = quá 7 ngày không có bài · Pending = chưa có bài lifetime.
            </div>
            {isLoading ? (
              <SkeletonRows count={8} />
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-medium">Trạng thái</th>
                      <th className="px-3 py-2 font-medium">Host</th>
                      <th className="px-3 py-2 font-medium">7 ngày</th>
                      <th className="px-3 py-2 font-medium text-right">Tin tổng</th>
                      <th className="px-3 py-2 font-medium">Bài cuối</th>
                    </tr>
                  </thead>
                  <tbody>
                    {macMiniHosts.map((h) => {
                      const status =
                        h.status === "producing"
                          ? { icon: <CheckCircle2 className="h-4 w-4 text-green-600" />, label: "Producing", cls: "text-green-700" }
                          : h.status === "silent"
                          ? { icon: <PauseCircle className="h-4 w-4 text-orange-500" />, label: "Silent quá 7d", cls: "text-orange-600" }
                          : { icon: <CircleDot className="h-4 w-4 text-slate-400" />, label: "Pending", cls: "text-slate-500" };
                      const counts = sevenDayCountsByMacMiniHost.get(h.host) ?? [0, 0, 0, 0, 0, 0, 0];
                      const anchor = `row-host-${h.host}`;
                      const flash = flashAnchor === anchor;
                      return (
                        <tr id={anchor} key={h.host} className={`border-t hover:bg-muted/30 transition-colors ${flash ? "bg-yellow-100" : ""}`}>
                          <td className="px-3 py-2">
                            <span className={`inline-flex items-center gap-1 ${status.cls}`}>
                              {status.icon}<span className="text-xs">{status.label}</span>
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">{h.host}</td>
                          <td className="px-3 py-2"><Sparkline counts={counts} /></td>
                          <td className="px-3 py-2 text-right font-mono">{h.count}</td>
                          <td className="px-3 py-2 text-muted-foreground text-xs">
                            {h.latest ? getRelativeTime(h.latest) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="rss-discovery">
            <div className="text-xs text-muted-foreground mb-2">
              Edge function quét RSS báo tổng hợp + Haiku classifier để tìm tin liên quan ngành điện.
            </div>
            {isLoading ? (
              <SkeletonRows count={8} />
            ) : discoveryBreakdown.length === 0 ? (
              <div className="text-sm text-muted-foreground">Chưa có tin từ RSS Discovery.</div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-medium">Domain</th>
                      <th className="px-3 py-2 font-medium text-right">Tin</th>
                      <th className="px-3 py-2 font-medium">Bài cuối</th>
                    </tr>
                  </thead>
                  <tbody>
                    {discoveryBreakdown.map((d) => (
                      <tr key={d.domain} className="border-t hover:bg-muted/30">
                        <td className="px-3 py-2 font-mono text-xs">{d.domain}</td>
                        <td className="px-3 py-2 text-right font-mono">{d.count}</td>
                        <td className="px-3 py-2 text-muted-foreground text-xs">{getRelativeTime(d.latest)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="disabled">
            <DisabledGroup
              title="Đã handover Mac Mini Scraper"
              hint="Edge crawler bỏ qua, Playwright cover. Yên tâm trừ khi Mac Mini im lặng (xem tab Mac Mini)."
              sources={disabledGrouped.handover}
              loading={isLoading}
              cls="bg-blue-50/40"
              flashAnchor={flashAnchor}
            />
            <DisabledGroup
              title="Hard fail (chưa có solution)"
              hint="Cần Playwright adapter hoặc proxy VN. Mark khi đã có handover."
              sources={disabledGrouped["hard-fail"]}
              loading={isLoading}
              cls="bg-red-50/40"
              flashAnchor={flashAnchor}
            />
            <DisabledGroup
              title="Anti-bot / JS-render"
              hint="Site dùng Cloudflare/D1N/JS-only render. Cần Playwright."
              sources={disabledGrouped["anti-bot"]}
              loading={isLoading}
              cls="bg-orange-50/40"
              flashAnchor={flashAnchor}
            />
            <DisabledGroup
              title="Off-topic / cleanup"
              hint="Disabled vì list_url không sectional, hoặc redundant với RSS Discovery."
              sources={disabledGrouped["off-topic"]}
              loading={isLoading}
              cls="bg-amber-50/40"
              flashAnchor={flashAnchor}
            />
            <DisabledGroup
              title="Lý do không rõ"
              hint="last_error trống hoặc không match pattern. Nên audit."
              sources={disabledGrouped.unknown}
              loading={isLoading}
              cls="bg-slate-50/40"
              flashAnchor={flashAnchor}
            />
          </TabsContent>

          <TabsContent value="ai-agents">
            <div className="space-y-6">
              <section className="rounded-md border">
                <div className="px-4 py-3 border-b bg-muted/30">
                  <div className="text-base font-semibold flex items-center gap-2">
                    🔍 Phase E — Auto-discovery sources
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Mỗi 03:00 UTC: quét 5 Google News query (EVN/lưới · tái tạo · chính sách · vận hành · doanh nghiệp) →
                    group domain → probe top 5. <strong>2 nhánh tự động</strong>:
                    {" "}<span className="text-green-700">RSS auto-add (max 3/day)</span> nếu site có RSS feed,
                    {" "}<span className="text-violet-700">Playwright handover (max 3/day)</span> nếu sample ≥10 nhưng không-RSS
                    (Phase E suy luận link_pattern từ trang chủ → INSERT row pending → Mac Mini test 24h).
                    {candidateStats.latest && (
                      <> Last run: <strong>{getRelativeTime(candidateStats.latest)}</strong>.</>
                    )}
                  </div>
                </div>

                <div className="p-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="rounded border bg-green-50 p-2 text-center">
                    <div className="text-xl font-bold text-green-700">{candidateStats.added7d}</div>
                    <div className="text-xs text-green-800">RSS + Playwright add (7d)</div>
                  </div>
                  <div className="rounded border bg-blue-50 p-2 text-center">
                    <div className="text-xl font-bold text-blue-700">{candidateStats.last7d}</div>
                    <div className="text-xs text-blue-800">Tổng probe (7d)</div>
                  </div>
                  <div className="rounded border bg-amber-50 p-2 text-center">
                    <div className="text-xl font-bold text-amber-700">
                      {(candidateStats.byStatus.get("rejected_anti_bot") ?? 0) +
                       (candidateStats.byStatus.get("rejected_no_rss") ?? 0)}
                    </div>
                    <div className="text-xs text-amber-800">Anti-bot/No RSS (30d)</div>
                  </div>
                  <div className="rounded border bg-slate-50 p-2 text-center">
                    <div className="text-xl font-bold text-slate-700">
                      {candidateStats.byStatus.get("rejected_low_count") ?? 0}
                    </div>
                    <div className="text-xs text-slate-700">Sample thấp (30d)</div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30">
                      <tr className="text-left">
                        <th className="px-3 py-2 font-medium">Khi</th>
                        <th className="px-3 py-2 font-medium">Domain</th>
                        <th className="px-3 py-2 font-medium">Query</th>
                        <th className="px-3 py-2 font-medium text-right">Sample</th>
                        <th className="px-3 py-2 font-medium">Decision</th>
                        <th className="px-3 py-2 font-medium">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(candidates ?? []).slice(0, 20).map((c) => {
                        const st = CANDIDATE_STATUS[c.status] ?? { label: c.status, cls: "bg-slate-50 border-slate-200 text-slate-700" };
                        return (
                          <tr key={c.id} className="border-t hover:bg-muted/30">
                            <td className="px-3 py-2 text-xs text-muted-foreground">{getRelativeTime(c.discovered_at)}</td>
                            <td className="px-3 py-2 font-mono text-xs">{c.domain}</td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              {c.query_seed ? (QUERY_SEED_LABEL[c.query_seed] ?? c.query_seed) : "—"}
                            </td>
                            <td className="px-3 py-2 text-right font-mono">{c.sample_count}</td>
                            <td className="px-3 py-2">
                              <Badge variant="outline" className={`font-normal text-xs ${st.cls}`}>
                                {st.label}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground max-w-xs truncate" title={c.decision_reason ?? ""}>
                              {c.decision_reason ?? "—"}
                            </td>
                          </tr>
                        );
                      })}
                      {(candidates?.length ?? 0) === 0 && (
                        <tr><td colSpan={6} className="px-3 py-4 text-center text-sm text-muted-foreground italic">
                          Chưa có candidate nào trong 30 ngày.
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-md border">
                <div className="px-4 py-3 border-b bg-muted/30">
                  <div className="text-base font-semibold flex items-center gap-2">
                    🤖 Phase G — AI auto-fix selector
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Mỗi 04:00 UTC: source Tier 1/2 có cf≥3 + last_error chứa 'no candidates parsed' →
                    Claude Haiku đề xuất regex pattern mới → test trên list_url → apply nếu match ≥5 link.
                  </div>
                </div>

                {(selectorFixes?.length ?? 0) === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground italic text-center">
                    Chưa có lần fix nào. Agent đang chờ trigger: cần source Tier 1/2 fail ≥3 lần với
                    "no candidates parsed" trong last_error. Hiện không có source nào match điều kiện
                    → agent đứng im, đây là trạng thái đúng.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/30">
                        <tr className="text-left">
                          <th className="px-3 py-2 font-medium">Khi</th>
                          <th className="px-3 py-2 font-medium">Source</th>
                          <th className="px-3 py-2 font-medium">Pattern cũ → mới</th>
                          <th className="px-3 py-2 font-medium text-right">Confidence</th>
                          <th className="px-3 py-2 font-medium text-right">Match</th>
                          <th className="px-3 py-2 font-medium">Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectorFixes ?? []).map((f) => (
                          <tr key={f.id} className="border-t hover:bg-muted/30">
                            <td className="px-3 py-2 text-xs text-muted-foreground">{getRelativeTime(f.attempted_at)}</td>
                            <td className="px-3 py-2 font-medium">{f.source_name}</td>
                            <td className="px-3 py-2 font-mono text-xs">
                              <div className="text-muted-foreground line-through truncate max-w-xs" title={f.old_pattern ?? ""}>
                                {f.old_pattern ?? "—"}
                              </div>
                              <div className="truncate max-w-xs" title={f.new_pattern ?? ""}>
                                {f.new_pattern ?? "—"}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-xs">
                              {f.llm_confidence != null ? f.llm_confidence.toFixed(2) : "—"}
                            </td>
                            <td className="px-3 py-2 text-right font-mono">{f.test_match_count ?? "—"}</td>
                            <td className="px-3 py-2">
                              <Badge
                                variant="outline"
                                className={`font-normal text-xs ${
                                  f.applied ? "bg-green-50 border-green-200 text-green-800" : "bg-slate-50 border-slate-200 text-slate-600"
                                }`}
                              >
                                {f.result ?? (f.applied ? "applied" : "—")}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

const Sparkline = ({ counts }: { counts: number[] }) => {
  const max = Math.max(1, ...counts);
  const total = counts.reduce((s, c) => s + c, 0);
  return (
    <div
      className="inline-flex items-end gap-[2px] h-6 w-20"
      title={`7 ngày qua (cũ → mới): ${counts.join(" · ")} — tổng ${total}`}
    >
      {counts.map((c, i) => (
        <div
          key={i}
          className={`flex-1 rounded-sm ${c > 0 ? "bg-emerald-400" : "bg-muted"}`}
          style={{ height: c > 0 ? `${Math.max(15, (c / max) * 100)}%` : "10%" }}
        />
      ))}
    </div>
  );
};

const BarRow = ({ label, value, pct, cls }: { label: string; value: number; pct: number; cls: string }) => (
  <div className="flex items-center gap-3 text-sm">
    <div className="w-44 shrink-0 text-muted-foreground">{label}</div>
    <div className="flex-1 h-5 bg-muted rounded overflow-hidden">
      <div className={`h-full ${cls}`} style={{ width: `${pct}%` }} />
    </div>
    <div className="w-24 text-right font-mono text-xs">
      <span className="font-semibold">{value}</span>
      <span className="text-muted-foreground"> · {pct}%</span>
    </div>
  </div>
);

const SkeletonRows = ({ count }: { count: number }) => (
  <div className="space-y-2">
    {Array.from({ length: count }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
  </div>
);

const DisabledGroup = ({
  title,
  hint,
  sources,
  loading,
  cls,
  flashAnchor,
}: {
  title: string;
  hint: string;
  sources: Source[];
  loading: boolean;
  cls: string;
  flashAnchor: string | null;
}) => {
  if (loading) return null;
  if (sources.length === 0) return null;
  return (
    <div className={`rounded-md border mb-4 ${cls}`}>
      <div className="px-3 py-2 border-b bg-background/40">
        <div className="text-sm font-semibold">
          {title} <span className="text-muted-foreground font-normal">({sources.length})</span>
        </div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-muted/30">
          <tr className="text-left">
            <th className="px-3 py-2 font-medium">Nguồn</th>
            <th className="px-3 py-2 font-medium">Domain</th>
            <th className="px-3 py-2 font-medium">Tier</th>
            <th className="px-3 py-2 font-medium">Disabled</th>
            <th className="px-3 py-2 font-medium">Lý do</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((s) => {
            const anchor = `row-disabled-${s.id}`;
            const flash = flashAnchor === anchor;
            return (
              <tr id={anchor} key={s.id} className={`border-t hover:bg-background/40 transition-colors ${flash ? "bg-yellow-100" : ""}`}>
                <td className="px-3 py-2 font-medium">{s.name}</td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{getHost(s.base_url)}</td>
                <td className="px-3 py-2">
                  {TIER_LABEL[s.tier] && (
                    <Badge variant="outline" className={`font-normal text-xs ${TIER_LABEL[s.tier].cls}`}>
                      {TIER_LABEL[s.tier].label}
                    </Badge>
                  )}
                </td>
                <td className="px-3 py-2 text-muted-foreground text-xs">
                  {s.last_crawled_at ? getRelativeTime(s.last_crawled_at) : "—"}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground max-w-md truncate" title={s.last_error ?? ""}>
                  {s.last_error ?? ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default ElectricityDashboard;
