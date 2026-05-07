import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { Header } from "@/components/Header";
import { ElectricityNewsCard } from "@/components/ElectricityNewsCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Loader2, RotateCcw, Zap } from "lucide-react";
import { getRelativeTime } from "@/lib/dateUtils";
import { useReadingContext } from "@/contexts/ReadingContext";

type ElectricityNewsRow = {
  id: string;
  title: string;
  summary: string;
  original_url: string;
  published_at: string | null;
  crawled_at: string;
};

const PAGE_SIZE = 30;
const RECENT_DAYS = 7;

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

// Mobile detection — match pattern Index.tsx (/) line 124
const detectMobile = (): boolean => {
  if (typeof navigator === "undefined") return false;
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent,
    ) || window.innerWidth < 768
  );
};

const STORAGE_SCROLL_Y = "luot247_d_scroll_position";
const STORAGE_LAST_VISIBLE = "luot247_d_last_visible_news";
const STORAGE_SAVED_AT = "luot247_d_saved_at"; // ISO timestamp lúc save

const ElectricityNews = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isMobile] = useState<boolean>(() => detectMobile());
  // Desktop hiện ngay, mobile đợi scroll restore xong mới hiện (chống flash
  // jump khi reload). Match Index.tsx isScrollRestored pattern.
  const [isScrollRestored, setIsScrollRestored] = useState<boolean>(() => !detectMobile());
  // Session-only set: ID của các card user đã lướt qua trước khi refresh.
  // Sau khi mobile restore từ lastVisibleNewsId, tất cả card phía trước được
  // tạm ẩn (display:none) → user thấy tin restore ở top, list gọn gàng. Khác
  // với readElectricityNewsIds (persistent) — passedNewsIds reset mỗi reload.
  const [passedNewsIds, setPassedNewsIds] = useState<Set<string>>(new Set());
  const {
    readElectricityNewsIds,
    markElectricityNewsAsRead,
    clearReadElectricityNews,
    shouldHideReadElectricityNews,
    setShouldHideReadElectricityNews,
  } = useReadingContext();

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
  const hiddenCount = shouldHideReadElectricityNews
    ? allRows.filter(
        (r) => readElectricityNewsIds.has(r.id) || passedNewsIds.has(r.id),
      ).length
    : 0;
  const allHiddenWhenToggleOn =
    shouldHideReadElectricityNews && hiddenCount === allRows.length && allRows.length > 0;

  // Wrap clear: vừa clear context vừa reset session passedNewsIds
  const handleClearAll = () => {
    clearReadElectricityNews();
    setPassedNewsIds(new Set());
  };

  // Scroll compensation cho mark-then-collapse: anchor = card đầu tiên
  // visible (không bị hide), capture top trước mark; useLayoutEffect đo
  // lại sau commit và scrollBy delta. Cross-platform (Chrome+Safari,
  // Android+iOS) — bypass mọi browser-specific scroll-anchor heuristic.
  const anchorRef = useRef<{ id: string; topPx: number } | null>(null);

  // Refs cho closure stable — không lệ thuộc render cycle.
  const listRef = useRef<HTMLDivElement | null>(null);
  const markRef = useRef(markElectricityNewsAsRead);
  const readSetRef = useRef(readElectricityNewsIds);
  const shouldHideRef = useRef(shouldHideReadElectricityNews);
  markRef.current = markElectricityNewsAsRead;
  readSetRef.current = readElectricityNewsIds;
  shouldHideRef.current = shouldHideReadElectricityNews;

  // Scroll compensation chỉ chạy trên DESKTOP (mobile không auto-mark)
  useLayoutEffect(() => {
    if (isMobile) return;
    const anchor = anchorRef.current;
    if (!anchor) return;
    const el = document.querySelector<HTMLElement>(`[data-news-id="${anchor.id}"]`);
    if (!el) {
      anchorRef.current = null;
      return;
    }
    const newTop = el.getBoundingClientRect().top;
    const delta = newTop - anchor.topPx;
    if (Math.abs(delta) > 1) {
      window.scrollTo({ top: window.scrollY + delta, behavior: "instant" as ScrollBehavior });
    }
    anchorRef.current = null;
  });

  // DESKTOP ONLY: scroll-mark-as-read + compensation. Mobile dùng scroll-memory
  // pattern (xem useEffect dưới) — không auto-mark trên scroll vì layout
  // shift trên mobile gây jump (giống Index.tsx / mobile branch).
  useEffect(() => {
    if (isMobile) return;
    const root = listRef.current;
    if (!root) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let processing = false;

    const captureAnchor = () => {
      const cards = document.querySelectorAll<HTMLElement>("[data-news-id]");
      for (const card of cards) {
        const cardId = card.dataset.newsId!;
        if (shouldHideRef.current && readSetRef.current.has(cardId)) continue;
        const rect = card.getBoundingClientRect();
        if (rect.top > -50 && rect.top < window.innerHeight - 100) {
          anchorRef.current = { id: cardId, topPx: rect.top };
          return;
        }
      }
    };

    const onScroll = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (processing) return;
        processing = true;
        requestAnimationFrame(() => {
          const cards = root.querySelectorAll<HTMLElement>("[data-news-id]");
          let anchorCaptured = false;
          cards.forEach((card) => {
            const rect = card.getBoundingClientRect();
            if (rect.bottom < 0) {
              const id = card.dataset.newsId;
              if (id && !readSetRef.current.has(id)) {
                if (!anchorCaptured) {
                  captureAnchor();
                  anchorCaptured = true;
                }
                markRef.current(id);
              }
            }
          });
          processing = false;
        });
      }, 100);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (timer) clearTimeout(timer);
    };
  }, [allRows.length, isMobile]);

  // MOBILE ONLY: scroll position memory (save trên scroll/unload/visibility,
  // restore trên mount). Match Index.tsx pattern line 138-471. Cards "đã đọc"
  // không tự mark trên scroll — user dùng flip mode hoặc batch hide button.
  useEffect(() => {
    if (!isMobile) return;

    const saveScrollPosition = () => {
      try {
        localStorage.setItem(STORAGE_SCROLL_Y, String(window.scrollY));
        localStorage.setItem(STORAGE_SAVED_AT, new Date().toISOString());
        // Tìm card gần đỉnh viewport nhất (skip cards display:none)
        const cards = document.querySelectorAll<HTMLElement>("[data-news-id]");
        let closestId: string | null = null;
        let minDist = Infinity;
        cards.forEach((card) => {
          if (card.classList.contains("hidden")) return;
          const dist = Math.abs(card.getBoundingClientRect().top);
          if (dist < minDist) {
            minDist = dist;
            closestId = card.dataset.newsId ?? null;
          }
        });
        if (closestId) localStorage.setItem(STORAGE_LAST_VISIBLE, closestId);
      } catch {
        /* localStorage unavailable, ignore */
      }
    };

    let scrollTimer: ReturnType<typeof setTimeout> | undefined;
    const onScrollSave = () => {
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(saveScrollPosition, 1000);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") saveScrollPosition();
    };

    window.addEventListener("beforeunload", saveScrollPosition);
    window.addEventListener("pagehide", saveScrollPosition);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("scroll", onScrollSave, { passive: true });
    const periodic = setInterval(saveScrollPosition, 5000);

    return () => {
      window.removeEventListener("beforeunload", saveScrollPosition);
      window.removeEventListener("pagehide", saveScrollPosition);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("scroll", onScrollSave);
      if (scrollTimer) clearTimeout(scrollTimer);
      clearInterval(periodic);
    };
  }, [isMobile]);

  // MOBILE ONLY: restore khi cards render. Strategy:
  //   1. Tìm lastVisibleNewsId trong allRows.
  //   2. Nếu có → populate passedNewsIds với tất cả ID phía trước → cards
  //      đó display:none → tin lastVisible tự động ở top. ScrollTo(0,0).
  //   3. Auto-enable shouldHide để display:none thực sự apply.
  //   4. Nếu lastVisibleId KHÔNG trong allRows (đã trôi khỏi 7d window
  //      hoặc page chưa load tới) → fallback scroll-by-Y với stability.
  useEffect(() => {
    if (!isMobile) return;
    if (isScrollRestored) return;
    if (allRows.length === 0) return;

    const savedId = localStorage.getItem(STORAGE_LAST_VISIBLE);
    const savedY = localStorage.getItem(STORAGE_SCROLL_Y);

    if (!savedId && !savedY) {
      setIsScrollRestored(true);
      return;
    }

    const restoreTimer = setTimeout(() => {
      // Strategy 1: hide cards CŨ (đã lướt qua trước save) — KHÔNG hide tin
      // mới crawl sau save. Distinguish bằng crawled_at vs savedAt timestamp.
      if (savedId) {
        const idx = allRows.findIndex((r) => r.id === savedId);
        if (idx > 0) {
          const savedAtStr = localStorage.getItem(STORAGE_SAVED_AT);
          const savedAt = savedAtStr ? new Date(savedAtStr).getTime() : 0;
          const passed = new Set<string>();
          for (let i = 0; i < idx; i++) {
            // Card crawled trước hoặc bằng savedAt → user đã thấy → ẩn.
            // Card crawled SAU savedAt → tin mới → giữ visible.
            const crawledMs = new Date(allRows[i].crawled_at).getTime();
            if (savedAt > 0 && crawledMs <= savedAt) {
              passed.add(allRows[i].id);
            }
          }
          if (passed.size > 0) {
            setPassedNewsIds(passed);
            setShouldHideReadElectricityNews(true);
          }
          // Scroll tới card lastVisibleId (KHÔNG phải scroll 0). Tin mới ở
          // trên (cuộn lên xem được), savedId ở top viewport.
          requestAnimationFrame(() => {
            const target = document.querySelector<HTMLElement>(
              `[data-news-id="${savedId}"]`,
            );
            if (target) {
              const rect = target.getBoundingClientRect();
              const targetY = window.scrollY + rect.top - 60; // header offset
              window.scrollTo(0, Math.max(0, targetY));
            }
            setIsScrollRestored(true);
          });
          return;
        }
      }

      // Strategy 2 (fallback): scroll-by-Y với stability check
      if (savedY) {
        window.scrollTo(0, parseInt(savedY, 10) || 0);
      }
      let stable = 0;
      let last = window.scrollY;
      let attempts = 0;
      const maxAttempts = 20;
      const check = () => {
        attempts++;
        const now = window.scrollY;
        if (Math.abs(now - last) < 2) stable++;
        else stable = 0;
        last = now;
        if (stable >= 3 || attempts >= maxAttempts) {
          setIsScrollRestored(true);
        } else {
          setTimeout(check, 100);
        }
      };
      setTimeout(check, 100);
    }, 300);

    return () => clearTimeout(restoreTimer);
  }, [isMobile, allRows.length, isScrollRestored, setShouldHideReadElectricityNews]);

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

      <main
        className={`w-full max-w-2xl mx-auto px-4 py-4 transition-opacity duration-200 ${
          isMobile && !isScrollRestored ? "opacity-0" : "opacity-100"
        }`}
      >
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
            {/* Toolbar: hide-read toggle + clear. Counter gồm cả "đã đọc"
                (read persistent) và "đã lướt qua" (passed session-only sau
                refresh trên mobile). */}
            {(readElectricityNewsIds.size > 0 ||
              passedNewsIds.size > 0 ||
              hiddenCount > 0) && (
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-sm">
                <span className="text-muted-foreground">
                  {hiddenCount > 0
                    ? `Đang ẩn ${hiddenCount} tin đã đọc/lướt qua`
                    : `Đã đọc ${readElectricityNewsIds.size + passedNewsIds.size} tin`}
                </span>
                <div className="flex gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShouldHideReadElectricityNews(!shouldHideReadElectricityNews)}
                  >
                    {shouldHideReadElectricityNews ? (
                      <>
                        <Eye className="h-4 w-4 mr-1" /> Hiện đã đọc
                      </>
                    ) : (
                      <>
                        <EyeOff className="h-4 w-4 mr-1" /> Ẩn đã đọc
                      </>
                    )}
                  </Button>
                  {(readElectricityNewsIds.size > 0 || passedNewsIds.size > 0) && (
                    <Button size="sm" variant="ghost" onClick={handleClearAll}>
                      <RotateCcw className="h-4 w-4 mr-1" /> Xoá lịch sử
                    </Button>
                  )}
                </div>
              </div>
            )}

            {allHiddenWhenToggleOn ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>Bạn đã đọc hết tin. Nhấn "Hiện đã đọc" để xem lại.</p>
              </div>
            ) : (
              <div ref={listRef} className="border rounded-lg overflow-hidden bg-card divide-y divide-gray-200">
                {allRows.map((item) => {
                  const isHidden =
                    shouldHideReadElectricityNews &&
                    (readElectricityNewsIds.has(item.id) || passedNewsIds.has(item.id));
                  // Instant display:none thay vì max-height transition. Lý do:
                  // gradual shrink (300ms) làm scroll-anchor của Chrome KHÔNG
                  // trigger (browser anchor heuristic detect "sudden shift",
                  // gradual = drift). Instant remove → 1 layout shift → manual
                  // useLayoutEffect compensate scrollBy bằng delta đo được.
                  return (
                    <div
                      key={item.id}
                      data-news-id={item.id}
                      className={isHidden ? "hidden" : ""}
                      aria-hidden={isHidden ? true : undefined}
                    >
                      <ElectricityNewsCard
                        title={item.title}
                        summary={item.summary}
                        originalUrl={item.original_url}
                        publishedAt={item.published_at}
                        crawledAt={item.crawled_at}
                      />
                    </div>
                  );
                })}
              </div>
            )}
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
