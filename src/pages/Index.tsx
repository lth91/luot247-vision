import { useEffect, useState, useRef } from "react";
import { Header } from "@/components/Header";
import { NewsItem } from "@/components/NewsItem";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import { useReadingContext } from "@/contexts/ReadingContext";
import { useFavorites } from "@/contexts/FavoritesContext";
import { useSearchParams } from "react-router-dom";
import { SUBMISSION_CATEGORIES, categoryLabel } from "@/lib/newsCategories";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { ListFilter } from "lucide-react";
import { useSubmissionAllowed } from "@/hooks/useSubmissionAllowed";

// Logger chỉ chạy ở dev; production (Vercel) im lặng hoàn toàn.
// Trước đây 55 console.log rải trong scroll handler + interval 5s + loop từng
// tin → nghẽn CPU gây giật, nhất là mobile. Gate qua import.meta.env.DEV để
// giữ log khi debug local mà không tốn gì trên production.
const dbg: (...args: unknown[]) => void = import.meta.env.DEV ? console.log : () => {};

const Index = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  // Thành viên whitelist mới thấy nút 🚩 báo thẻ trên tin của đồng nghiệp.
  const canReport = useSubmissionAllowed(session?.user?.id) === true;
  const [isLoading, setIsLoading] = useState(true);
  const [showReadNews, setShowReadNews] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isScrollRestored, setIsScrollRestored] = useState(false);
  const [passedNewsIds, setPassedNewsIds] = useState<Set<string>>(new Set());
  const newsItemsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  
  // Use ReadingContext
  const {
    news,
    setNews,
    filteredNews,
    readNewsIds,
    markNewsAsRead,
    clearReadNews,
    shouldHideReadNews,
    setShouldHideReadNews,
    setCurrentNewsIndex,
    setHighlightedNewsId,
    setIsFromSharedLink
  } = useReadingContext();
  
  // Use FavoritesContext
  const { favoriteIds } = useFavorites();

  // Lọc theo chuyên mục — đồng bộ URL (?chuyen-muc=slug) để chia sẻ được.
  const [searchParams, setSearchParams] = useSearchParams();
  const activeCategory = searchParams.get("chuyen-muc") || "";
  // Hiện CỐ ĐỊNH cả 6 chuyên mục (kể cả mục chưa có tin) — bấm mục rỗng sẽ ra
  // màn "Chưa có tin...". Đồng nhất, người đọc luôn thấy đủ danh mục.
  const availableCategories = SUBMISSION_CATEGORIES;
  const selectCategory = (slug: string) => {
    const next = new URLSearchParams(searchParams);
    if (slug) next.set("chuyen-muc", slug);
    else next.delete("chuyen-muc");
    setSearchParams(next, { replace: true });
    window.scrollTo(0, 0);
  };

  // Nút nổi đổi chuyên mục khi đang cuộn — bấm bật menu nhỏ ngay từ nút. Chỉ
  // hiện sau khi cuộn qua khỏi bộ lọc đầu trang để khỏi che nội dung lúc ở trên.
  const [catMenuOpen, setCatMenuOpen] = useState(false);
  const [showCatFab, setShowCatFab] = useState(false);
  useEffect(() => {
    const onScroll = () => setShowCatFab(window.scrollY > 320);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const selectCategoryAndClose = (slug: string) => {
    setCatMenuOpen(false);
    selectCategory(slug);
  };
  // Item trong menu nổi — danh sách dọc gọn.
  const menuItemCls = (active: boolean) =>
    `w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
      active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
    }`;
  const chipCls = (active: boolean) =>
    `whitespace-nowrap rounded-full border px-3 py-1.5 text-xs leading-tight transition-colors ${
      active
        ? "bg-primary text-primary-foreground border-primary"
        : "bg-background text-muted-foreground border-border hover:bg-muted"
    }`;

  // Danh sách tin hiển thị: bỏ tin đã "trôi qua" + lọc theo chuyên mục đang chọn.
  const visibleNews = filteredNews
    .filter((item) => !passedNewsIds.has(item.id))
    .filter((item) => !activeCategory || item.category === activeCategory);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user) {
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .maybeSingle()
        .then(({ data }) => {
          setUserRole(data?.role || null);
        });

      // fetchFavorites(); // Removed - using FavoritesContext now
    } else {
      setUserRole(null);
    }
  }, [session]);

  useEffect(() => {
    fetchNews();
    loadReadNewsFromStorage();
    
    // Record a view when user visits the website
    recordPageView();
    
    // Mark as no longer initial load
    setIsInitialLoad(false);
    dbg('🚀 Page load complete - isInitialLoad = false');
    
    // Expose clear function to window for debugging
    (window as any).clearReadNews = clearReadNews;

    // Handle deep link to specific news
    handleDeepLink();
  }, []);

  const recordPageView = async () => {
    try {
      // Insert a view log record using server time to avoid timezone issues
      await (supabase as any).from("view_logs2").insert({});
      dbg('✅ Page view recorded to view_logs2');
    } catch (error) {
      console.error('❌ Error recording page view:', error);
    }
  };

  // Load read news from localStorage
  const loadReadNewsFromStorage = () => {
    try {
      const stored = localStorage.getItem('luot247_read_news');
      dbg('🔍 Loading from localStorage:', stored);
      if (stored) {
        const readIds = JSON.parse(stored);
        dbg('📚 Loaded read news IDs:', readIds);
        dbg('📚 Loaded read news count:', readIds.length);
        // Note: We don't need to set readNewsIds here as it's handled by ReadingContext
      } else {
        dbg('📚 No read news in localStorage');
      }
    } catch (error) {
      console.error('❌ Error loading read news from storage:', error);
    }
  };

  // Sync current index when scrolling in scroll mode
  const syncCurrentIndex = (newsId: string) => {
    const index = filteredNews.findIndex(item => item.id === newsId);
    if (index !== -1) {
      setCurrentNewsIndex(index);
      dbg(`🔄 Synced current index to ${index} for news ${newsId}`);
    }
  };

  // Mobile restore (sửa 24/6): KHÔNG còn blanket-hide tin trước last_visible_news.
  // Bug cũ: ẩn TẤT CẢ tin nằm trước vị trí đọc cũ → tin mới import lên đầu feed
  // (newest) nằm phía trên vị trí cũ nên bị ẩn sạch DÙ CHƯA ĐỌC → "sau refresh
  // tin format mới biến mất, feed bắt đầu từ tin cũ".
  // Giờ: tin đã đọc được ẩn qua readNewsIds/shouldHideReadNews; tin chưa đọc
  // (gồm tin mới) LUÔN hiện, mới nhất trên đầu. Bắt đầu ở đầu feed.
  useEffect(() => {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
    if (!isMobile) return;
    if (isLoading || filteredNews.length === 0) return;
    if (isScrollRestored) return;

    window.scrollTo(0, 0);
    setIsScrollRestored(true);
  }, [isLoading, filteredNews, isScrollRestored]);

  // Khi user bật "Hiển thị tất cả tin đã đọc" (shouldHideReadNews=false), xóa
  // passedNewsIds — nếu không, các tin đã ẩn lúc khôi phục (mobile) vẫn bị
  // passedNewsIds lọc ra → "hiển thị lại" không hiện đủ tin.
  useEffect(() => {
    if (!shouldHideReadNews) {
      setPassedNewsIds(new Set());
    }
  }, [shouldHideReadNews]);

  // Mobile auto-mark-read bằng IntersectionObserver (sửa 24/6).
  // Trước đây mobile chỉ blanket-hide vị trí cuối → không thực sự đánh dấu
  // tin nào đã đọc. Giờ dùng IO chuẩn: khi card scroll lên qua khỏi top
  // viewport (rootMargin top âm = ra ngoài), đánh dấu đã đọc.
  // Filter dùng snapshot readNewsIdsAtMount nên KHÔNG biến mất ngay → mượt.
  // Tin chỉ ẩn ở lần reload sau.
  useEffect(() => {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
    if (!isMobile) return;
    if (isLoading || filteredNews.length === 0) return;

    // Map id → element vừa observe. Khi mount/unmount node, re-build observer.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          // Card đã scroll RA NGOÀI viewport phía trên (trôi qua khỏi header).
          // boundingClientRect.bottom < 0 nghĩa là cạnh dưới đã trên top.
          if (!entry.isIntersecting && entry.boundingClientRect.bottom < 60) {
            const id = (entry.target as HTMLElement).dataset.newsId;
            if (id) markNewsAsRead(id);
          }
        }
      },
      // rootMargin -60px top: bù chiều cao header. Card "out of viewport" khi
      // qua khỏi header, không tính phần bị header che.
      { root: null, rootMargin: '-60px 0px 0px 0px', threshold: 0 },
    );

    // Observe tất cả card hiện có
    newsItemsRef.current.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [isLoading, filteredNews, markNewsAsRead]);

  // Legacy mobile RADICAL restore (giữ làm fallback, sẽ noop nếu effect trên đã set restored)
  useEffect(() => {
    // Detect if user is on mobile
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
    
    // If not mobile, show content immediately
    if (!isMobile) {
      dbg('🖥️ Desktop detected: Showing content immediately');
      setIsScrollRestored(true);
    }
    
    dbg('🔍 Device detection:', {
      userAgent: navigator.userAgent,
      windowWidth: window.innerWidth,
      isMobile: isMobile
    });
    
    if (isMobile) {
      dbg('📱 Mobile detected: Using radical anti-jittering approach');

      // Save scroll position and last read news before page unload (refresh)
      const saveScrollPosition = () => {
        const scrollY = window.scrollY;
        localStorage.setItem('luot247_scroll_position', scrollY.toString());
        
        dbg('📱 saveScrollPosition called:', {
          scrollY: scrollY,
          newsItemsCount: newsItemsRef.current.size,
          timestamp: new Date().toISOString()
        });
        
        // Find the news item closest to the top of viewport
          const header = document.querySelector('header');
        if (header) {
          const headerRect = header.getBoundingClientRect();
          const headerBottom = headerRect.bottom;
          const bufferZone = 100; // Large buffer for mobile
          const effectiveHeaderBottom = headerBottom + bufferZone;
          
          dbg('📱 Header info:', {
            headerBottom: headerBottom,
            effectiveHeaderBottom: effectiveHeaderBottom,
            bufferZone: bufferZone
          });
          
          let closestNewsId = null;
          let minDistance = Infinity;
          
          // Check all news items to find the one closest to the top of viewport
          newsItemsRef.current.forEach((element, newsId) => {
            if (!element) return;
            
            const elementRect = element.getBoundingClientRect();
            const elementTop = elementRect.top;
            const elementBottom = elementRect.bottom;
            
            dbg(`📱 News ${newsId}:`, {
              top: elementTop,
              bottom: elementBottom,
              distanceFromTop: Math.abs(elementTop)
            });
            
            // Find the news item closest to the top of viewport (closest to 0)
            // This will be the last news item the user was reading
            const distanceFromTop = Math.abs(elementTop);
            if (distanceFromTop < minDistance) {
              minDistance = distanceFromTop;
              closestNewsId = newsId;
            }
          });
          
          dbg('📱 Closest news analysis:', {
            closestNewsId: closestNewsId,
            minDistance: minDistance
          });
          
          if (closestNewsId) {
            localStorage.setItem('luot247_last_visible_news', closestNewsId);
            dbg(`📱 ✅ Saved last visible news: ${closestNewsId} at position: ${scrollY}`);
          } else {
            dbg('📱 ❌ No visible news found to save');
          }
        } else {
          dbg('📱 ❌ Header not found');
        }
        
        dbg(`📱 Saved scroll position: ${scrollY}`);
      };
      
      // RADICAL APPROACH: Hide content completely until scroll is 100% stable
      const restoreScrollPosition = () => {
        dbg('📱 restoreScrollPosition called - RADICAL MODE');
        
        const savedScrollY = localStorage.getItem('luot247_scroll_position');
        const lastVisibleNewsId = localStorage.getItem('luot247_last_visible_news');
        const readNewsIds = JSON.parse(localStorage.getItem('luot247_read_news') || '[]');
        
        dbg('📱 Restore data:', {
          savedScrollY: savedScrollY,
          lastVisibleNewsId: lastVisibleNewsId,
          readNewsCount: readNewsIds.length,
          newsItemsRefSize: newsItemsRef.current.size
        });
        
        if (savedScrollY) {
          const scrollY = parseInt(savedScrollY);
          dbg(`📱 Processing saved scroll position: ${scrollY}`);
          
          // Wait for news to load and DOM to be ready
          setTimeout(() => {
            dbg('📱 Starting RADICAL restore process after timeout');
            
            // First try to find the last visible news from before refresh
            let targetElement = null;
            
            if (lastVisibleNewsId) {
              targetElement = document.querySelector(`[data-news-id="${lastVisibleNewsId}"]`);
              dbg(`📱 Last visible news search:`, {
                newsId: lastVisibleNewsId,
                found: !!targetElement,
                element: targetElement
              });
            }
            
            // If not found, try to find the first unread news
            if (!targetElement) {
              dbg(`📱 Looking for first unread news, read count: ${readNewsIds.length}`);
              
              // Find the first news item that is not read
              newsItemsRef.current.forEach((element, newsId) => {
                if (!readNewsIds.includes(newsId) && !targetElement) {
                  targetElement = element;
                  dbg(`📱 Found first unread news: ${newsId}`);
                }
              });
            }
            
            dbg('📱 Target element:', {
              found: !!targetElement,
              element: targetElement
            });
            
            if (targetElement) {
              // Calculate target position
              const elementRect = targetElement.getBoundingClientRect();
              const headerHeight = 60; // Approximate header height
              const targetScrollY = window.scrollY + elementRect.top - headerHeight;
              const finalScrollY = Math.max(0, targetScrollY);
              
              dbg(`📱 RADICAL: Scrolling to target news:`, {
                elementRect: elementRect,
                headerHeight: headerHeight,
                currentScrollY: window.scrollY,
                targetScrollY: targetScrollY,
                finalScrollY: finalScrollY
              });
              
              // RADICAL APPROACH: Scroll immediately and wait for complete stability
              window.scrollTo(0, finalScrollY);
              
              // Wait for scroll to complete and then wait additional time for stability
              let stabilityChecks = 0;
              const maxStabilityChecks = 20;
              let lastScrollY = window.scrollY;
              let stableCount = 0;
              const requiredStableChecks = 5; // Need 5 consecutive stable checks
              
              const checkStability = () => {
                stabilityChecks++;
                const currentScrollY = window.scrollY;
                const scrollDiff = Math.abs(currentScrollY - finalScrollY);
                const positionDiff = Math.abs(currentScrollY - lastScrollY);
                
                dbg(`📱 RADICAL stability check ${stabilityChecks}:`, {
                  currentScrollY: currentScrollY,
                  targetScrollY: finalScrollY,
                  scrollDiff: scrollDiff,
                  positionDiff: positionDiff,
                  stableCount: stableCount,
                  lastScrollY: lastScrollY
                });
                
                // Check if position is stable (no movement) and close to target
                if (positionDiff < 2 && scrollDiff < 10) {
                  stableCount++;
                  dbg(`📱 RADICAL: Stable check ${stableCount}/${requiredStableChecks}`);
                  
                  if (stableCount >= requiredStableChecks) {
                    dbg('📱 RADICAL: Position is stable, showing content');
                    // Additional delay to ensure everything is settled
                    setTimeout(() => {
                      dbg('📱 RADICAL: Final delay complete, showing content');
                      // One final check to ensure position hasn't changed
                      const finalScrollDiff = Math.abs(window.scrollY - finalScrollY);
                      if (finalScrollDiff < 10) {
                        setIsScrollRestored(true);
                      } else {
                        dbg('📱 RADICAL: Position changed during final delay, restarting stability check');
                        stableCount = 0;
                        setTimeout(checkStability, 100);
                      }
                    }, 500); // Increased delay for better stability
                    return;
                  }
                } else {
                  stableCount = 0; // Reset stable count if position changed
                }
                
                lastScrollY = currentScrollY;
                
                if (stabilityChecks >= maxStabilityChecks) {
                  dbg('📱 RADICAL: Max stability checks reached, showing content');
                  setIsScrollRestored(true);
                } else {
                  setTimeout(checkStability, 50); // Check every 50ms
                }
              };
              
              // Start stability checking after a short delay
              setTimeout(checkStability, 100);
              
            } else {
              // Fallback: use saved scroll position
              dbg(`📱 RADICAL: No target news found, using saved position: ${scrollY}`);
              
              // Scroll to saved position
              window.scrollTo(0, scrollY);
              
              // Wait for stability
              let stabilityChecks = 0;
              const maxStabilityChecks = 20;
              let lastScrollY = window.scrollY;
              let stableCount = 0;
              const requiredStableChecks = 5;
              
              const checkStability = () => {
                stabilityChecks++;
                const currentScrollY = window.scrollY;
                const scrollDiff = Math.abs(currentScrollY - scrollY);
                const positionDiff = Math.abs(currentScrollY - lastScrollY);
                
                dbg(`📱 RADICAL fallback stability check ${stabilityChecks}:`, {
                  currentScrollY: currentScrollY,
                  targetScrollY: scrollY,
                  scrollDiff: scrollDiff,
                  positionDiff: positionDiff,
                  stableCount: stableCount,
                  lastScrollY: lastScrollY
                });
                
                if (positionDiff < 2 && scrollDiff < 10) {
                  stableCount++;
                  dbg(`📱 RADICAL fallback: Stable check ${stableCount}/${requiredStableChecks}`);
                  
                  if (stableCount >= requiredStableChecks) {
                    dbg('📱 RADICAL fallback: Position is stable, showing content');
                    setTimeout(() => {
                      dbg('📱 RADICAL fallback: Final delay complete, showing content');
                      // One final check to ensure position hasn't changed
                      const finalScrollDiff = Math.abs(window.scrollY - scrollY);
                      if (finalScrollDiff < 10) {
                        setIsScrollRestored(true);
                      } else {
                        dbg('📱 RADICAL fallback: Position changed during final delay, restarting stability check');
                        stableCount = 0;
                        setTimeout(checkStability, 100);
                      }
                    }, 500); // Increased delay for better stability
                    return;
                  }
                } else {
                  stableCount = 0;
                }
                
                lastScrollY = currentScrollY;
                
                if (stabilityChecks >= maxStabilityChecks) {
                  dbg('📱 RADICAL fallback: Max stability checks reached, showing content');
                  setIsScrollRestored(true);
                } else {
                  setTimeout(checkStability, 50);
                }
              };
              
              setTimeout(checkStability, 100);
            }
          }, 1000); // Increased delay to ensure DOM is fully ready
        } else {
          dbg('📱 No saved scroll position found');
          // No saved position, show content immediately
          dbg('📱 No saved position, showing content immediately');
          // Use requestAnimationFrame to ensure this happens after initial render
          requestAnimationFrame(() => {
            setIsScrollRestored(true);
          });
        }
      };
      
      // Add event listeners - use multiple events for mobile compatibility
      window.addEventListener('beforeunload', saveScrollPosition);
      window.addEventListener('pagehide', saveScrollPosition);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          dbg('📱 Page becoming hidden, saving scroll position');
          saveScrollPosition();
        }
      });
      
      // Also save on scroll to ensure we capture the position
      let scrollSaveTimeout: ReturnType<typeof setTimeout>;
      const saveOnScroll = () => {
        clearTimeout(scrollSaveTimeout);
        scrollSaveTimeout = setTimeout(() => {
          dbg('📱 Auto-saving scroll position on scroll');
          saveScrollPosition();
        }, 1000);
      };
      window.addEventListener('scroll', saveOnScroll, { passive: true });
      
      // Save position periodically as backup
      const periodicSave = setInterval(() => {
        dbg('📱 Periodic save of scroll position');
        saveScrollPosition();
      }, 5000); // Save every 5 seconds
      
      // RADICAL restore disabled 2026-05-09: replaced bởi effect "hide passed +
      // scroll=0" ở trên. RADICAL setTimeout(1000) override scrollTo(0,0) của
      // effect mới → user vẫn thấy scroll lệch. Save logic giữ nguyên.
      
      return () => {
        window.removeEventListener('beforeunload', saveScrollPosition);
        window.removeEventListener('pagehide', saveScrollPosition);
        window.removeEventListener('scroll', saveOnScroll);
        clearTimeout(scrollSaveTimeout);
        clearInterval(periodicSave);
      };
    } else {
      dbg('🖥️ Desktop detected: Using scroll detection');
      
      // Desktop scroll detection (simplified)
      let scrollTimeout: ReturnType<typeof setTimeout>;
      let isProcessing = false;
      
      const handleScroll = () => {
        clearTimeout(scrollTimeout);
        
        scrollTimeout = setTimeout(() => {
          if (isProcessing) return;
          
          isProcessing = true;
          requestAnimationFrame(() => {
            const header = document.querySelector('header');
            if (!header) {
              isProcessing = false;
              return;
            }

            const headerRect = header.getBoundingClientRect();
            const headerBottom = headerRect.bottom;
            const bufferZone = 60;
            const effectiveHeaderBottom = headerBottom + bufferZone;

            // Find the news item that's currently most visible (closest to top of viewport)
            let mostVisibleNewsId = null;
            let minDistance = Infinity;

            // Parse read-news MỘT LẦN trước loop (trước đây parse lại cho từng tin
            // → O(n) JSON.parse mỗi lần scroll, góp phần gây giật).
            const storedRead = localStorage.getItem('luot247_read_news');
            const readIdsSet = new Set<string>(storedRead ? JSON.parse(storedRead) : []);

            newsItemsRef.current.forEach((element, newsId) => {
              if (!element) return;

              const elementRect = element.getBoundingClientRect();
              const elementTop = elementRect.top;
              const elementBottom = elementRect.bottom;

              // Check if element is visible and mark as read if needed
              if (elementBottom < effectiveHeaderBottom) {
                if (!readIdsSet.has(newsId)) {
                  dbg(`📖 Desktop: Marking news ${newsId} as read`);
                  markNewsAsRead(newsId);
                }
              }
              
              // Find the most visible news item (closest to top of viewport)
              if (elementTop <= effectiveHeaderBottom && elementBottom > effectiveHeaderBottom) {
                const distanceFromTop = Math.abs(elementTop - effectiveHeaderBottom);
                if (distanceFromTop < minDistance) {
                  minDistance = distanceFromTop;
                  mostVisibleNewsId = newsId;
                }
              }
            });
            
            // Sync current index to the most visible news
            if (mostVisibleNewsId) {
              syncCurrentIndex(mostVisibleNewsId);
              dbg(`🔄 Desktop: Synced to most visible news ${mostVisibleNewsId}`);
            }
            
            isProcessing = false;
          });
        }, 150);
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });
      
      return () => {
        window.removeEventListener('scroll', handleScroll);
        clearTimeout(scrollTimeout);
      };
    }
  }, []);

  const fetchNews = async () => {
    setIsLoading(true);
    
    // Get the last stored news count to check for new items
    const lastNewsCount = localStorage.getItem('luot247_last_news_count');
    const lastNewsTimestamp = localStorage.getItem('luot247_last_news_timestamp');
    
    const { data, error } = await supabase
      .from("news")
      .select("*")
      .eq("is_approved", true)  // Only show approved news
      .order("updated_at", { ascending: false });  // Sort by approval time

    if (error) {
      toast.error("Không thể tải tin tức");
      console.error(error);
    } else {
      setNews(data || []);
      
      // Check if there are new news items
      const currentNewsCount = data?.length || 0;
      const currentTimestamp = new Date().toISOString();
      
      // Check if news count increased OR if we're checking for the first time
      const hasNewNews = lastNewsCount && parseInt(lastNewsCount) < currentNewsCount;
      const isFirstLoad = !lastNewsCount && !lastNewsTimestamp;
      
      dbg('📊 News check:', {
        lastNewsCount,
        currentNewsCount,
        hasNewNews,
        isFirstLoad
      });
      
      if (hasNewNews) {
        dbg('🆕 New news detected! Clearing saved position to show latest news');
        // Clear saved scroll position to force showing latest news
        localStorage.removeItem('luot247_scroll_position');
        localStorage.removeItem('luot247_last_visible_news');
        
        // Reset reading position to start from new news
        setCurrentNewsIndex(0);
        localStorage.removeItem('luot247_current_index');
        
        // Update stored news count and timestamp
        localStorage.setItem('luot247_last_news_count', currentNewsCount.toString());
        localStorage.setItem('luot247_last_news_timestamp', currentTimestamp);
        
        toast.success(`Có ${currentNewsCount - parseInt(lastNewsCount)} tin tức mới!`);
      } else if (!isFirstLoad) {
        dbg('📰 No new news, keeping saved position');
        // Update stored news count to track
        localStorage.setItem('luot247_last_news_count', currentNewsCount.toString());
      } else {
        dbg('🆕 First load, storing initial count');
        // First load, store the initial count
        localStorage.setItem('luot247_last_news_count', currentNewsCount.toString());
        localStorage.setItem('luot247_last_news_timestamp', currentTimestamp);
      }
    }
    setIsLoading(false);
  };



  const handleDeepLink = () => {
    // Check for /tin/:id path
    const pathMatch = window.location.pathname.match(/^\/tin\/([a-f0-9-]+)$/);
    const newsId = pathMatch ? pathMatch[1] : null;
    
    if (newsId) {
      dbg('🔗 Deep link detected for news:', newsId);

      // Mark as coming from shared link to disable auto-hide
      setIsFromSharedLink(true);

      // Feed tải bất định (đôi khi hàng nghìn tin) → THỬ LẠI tới khi thấy phần tử
      // bài, thay vì đặt cứng 1.5s (dễ trượt). Tối đa ~6s.
      let attempts = 0;
      const tryScroll = () => {
        const newsElement = document.querySelector(`[data-news-id="${newsId}"]`);
        if (newsElement) {
          const headerHeight = 60;
          const targetPosition = newsElement.getBoundingClientRect().top + window.scrollY - headerHeight;
          window.scrollTo({ top: targetPosition, behavior: 'smooth' });
          setHighlightedNewsId(newsId);
          setTimeout(() => setHighlightedNewsId(null), 3000);
          dbg('✅ Scrolled to news:', newsId);
        } else if (attempts++ < 20) {
          setTimeout(tryScroll, 300);
        } else {
          dbg('❌ News element not found after retries:', newsId);
        }
      };
      setTimeout(tryScroll, 600);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header 
        user={session?.user} 
        userRole={userRole} 
        showReadNews={showReadNews}
        onToggleReadNews={() => {
          // Reset all read news
          clearReadNews();
          setShowReadNews(false);
        }}
      />

      <main className="w-full max-w-2xl mx-auto px-4 py-4">
        {/* Bộ lọc chuyên mục — "TẤT CẢ" + 9 mục = 10 nút xếp lưới 2 cột đều
            (5 nút/cột) trên desktop; mobile 1 cột (mỗi nhãn 1 dòng). */}
        {!isLoading && (
          <div className="mb-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button type="button" onClick={() => selectCategory("")} className={`${chipCls(!activeCategory)} w-full text-center`}>
              TẤT CẢ
            </button>
            {availableCategories.map((c) => (
              <button key={c.slug} type="button" onClick={() => selectCategory(c.slug)} className={`${chipCls(activeCategory === c.slug)} w-full text-center`}>
                {c.label}
              </button>
            ))}
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-12">
            <div className="flex flex-col items-center space-y-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <p className="text-muted-foreground">Đang tải tin tức...</p>
            </div>
          </div>
        ) : news.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Không có tin tức nào</p>
          </div>
        ) : (
          <>
            {/* Spinner overlay khi đang restore scroll — cards vẫn render để
                 querySelector tìm được, chỉ ẩn visually qua scroll-restoring class.
                 Trước đây gate `!isScrollRestored` block cards khỏi DOM → restore
                 không tìm được target → fallback scroll lệch vị trí. */}
            {!isScrollRestored && (
              <div className="text-center py-12 fixed inset-0 z-10 bg-background flex flex-col items-center justify-center space-y-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <p className="text-muted-foreground">Đang khôi phục vị trí đọc...</p>
              </div>
            )}
            {activeCategory && visibleNews.length === 0 ? (
              <div className="text-center py-12 space-y-3">
                <p className="text-muted-foreground">Chưa có tin trong chuyên mục này.</p>
                <button type="button" onClick={() => selectCategory("")} className={chipCls(false)}>
                  ← Xem tất cả
                </button>
              </div>
            ) : (
            <div className={`border rounded-lg overflow-hidden bg-card ${isScrollRestored ? 'scroll-restored' : 'scroll-restoring'}`}>
            {visibleNews.map((item, index, arr) => (
              <div
                key={item.id}
                data-news-id={item.id}
                ref={(el) => {
                  if (el) {
                    newsItemsRef.current.set(item.id, el);
                  } else {
                    // QUAN TRỌNG: xóa ref khi card unmount (tin bị ẩn). Trước đây
                    // chỉ set, không xóa → Map giữ DOM node detached → scroll
                    // handler đo getBoundingClientRect() trên node đã tháo (=0)
                    // → chọn nhầm "tin gần đỉnh" → lưu/khôi phục sai vị trí.
                    newsItemsRef.current.delete(item.id);
                  }
                }}
                style={{ display: 'block' }}
              >
                <NewsItem
                  id={item.id}
                  title={item.title}
                  description={item.description || ""}
                  category={item.category}
                  viewCount={item.view_count || 0}
                  url={item.url}
                  createdAt={item.updated_at}  // Use updated_at to show approval time
                  isAuthenticated={!!session}
                  isLast={index === arr.length - 1}
                  submittedBy={item.submitted_by}
                  currentUserId={session?.user?.id}
                  canReport={canReport}
                />
              </div>
            ))}
            </div>
            )}
          </>
        )}
      </main>

      {/* Nút nổi đổi chuyên mục khi đang cuộn — menu nhỏ bật lên ngay từ nút. */}
      {showCatFab && (
        <div className="fixed bottom-5 right-5 z-30">
          <Popover open={catMenuOpen} onOpenChange={setCatMenuOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Chọn chuyên mục"
                className="flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-lg"
              >
                <ListFilter className="h-4 w-4" />
                <span className="max-w-[150px] truncate">
                  {activeCategory ? categoryLabel(activeCategory) : "Chuyên mục"}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="end" sideOffset={8} className="w-52 p-1">
              <div className="flex flex-col">
                <button type="button" onClick={() => selectCategoryAndClose("")} className={menuItemCls(!activeCategory)}>
                  Tất cả
                </button>
                {availableCategories.map((c) => (
                  <button key={c.slug} type="button" onClick={() => selectCategoryAndClose(c.slug)} className={menuItemCls(activeCategory === c.slug)}>
                    {c.label}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
};

export default Index;
