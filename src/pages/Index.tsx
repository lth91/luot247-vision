import { useEffect, useState, useRef } from "react";
import { Header } from "@/components/Header";
import { NewsItem } from "@/components/NewsItem";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import { useReadingContext } from "@/contexts/ReadingContext";
import { useFavorites } from "@/contexts/FavoritesContext";

const Index = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
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
    console.log('🚀 Page load complete - isInitialLoad = false');
    
    // Expose clear function to window for debugging
    (window as any).clearReadNews = clearReadNews;

    // Handle deep link to specific news
    handleDeepLink();
  }, []);

  const recordPageView = async () => {
    try {
      // Insert a view log record using server time to avoid timezone issues
      await (supabase as any).from("view_logs2").insert({});
      console.log('✅ Page view recorded to view_logs2');
    } catch (error) {
      console.error('❌ Error recording page view:', error);
    }
  };

  // Load read news from localStorage
  const loadReadNewsFromStorage = () => {
    try {
      const stored = localStorage.getItem('luot247_read_news');
      console.log('🔍 Loading from localStorage:', stored);
      if (stored) {
        const readIds = JSON.parse(stored);
        console.log('📚 Loaded read news IDs:', readIds);
        console.log('📚 Loaded read news count:', readIds.length);
        // Note: We don't need to set readNewsIds here as it's handled by ReadingContext
      } else {
        console.log('📚 No read news in localStorage');
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
      console.log(`🔄 Synced current index to ${index} for news ${newsId}`);
    }
  };

  // Mobile restore strategy (UX 09/05): hide articles trước tin user đang đọc,
  // scroll về top → tin đang đọc là tin đầu tiên hiển thị (giống /d).
  // Chạy ngay khi filteredNews populate, KHÔNG đợi setTimeout(1000) của RADICAL.
  useEffect(() => {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
    if (!isMobile) return;
    if (isLoading || filteredNews.length === 0) return;
    if (isScrollRestored) return;

    const savedId = localStorage.getItem('luot247_last_visible_news');
    if (!savedId) {
      // Không có saved — hiển thị bình thường từ tin đầu
      window.scrollTo(0, 0);
      setIsScrollRestored(true);
      return;
    }

    const idx = filteredNews.findIndex((item) => item.id === savedId);
    if (idx <= 0) {
      // Không tìm được hoặc tin saved đã ở đầu — không cần hide
      window.scrollTo(0, 0);
      setIsScrollRestored(true);
      return;
    }

    // Hide tin từ index 0..idx-1 (user đã lướt qua trước khi refresh)
    const passed = new Set<string>();
    for (let i = 0; i < idx; i++) {
      passed.add(filteredNews[i].id);
    }
    setPassedNewsIds(passed);
    window.scrollTo(0, 0);
    // requestAnimationFrame để đảm bảo paint sau filter render xong
    requestAnimationFrame(() => setIsScrollRestored(true));
  }, [isLoading, filteredNews, isScrollRestored]);

  // Legacy mobile RADICAL restore (giữ làm fallback, sẽ noop nếu effect trên đã set restored)
  useEffect(() => {
    // Detect if user is on mobile
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
    
    // If not mobile, show content immediately
    if (!isMobile) {
      console.log('🖥️ Desktop detected: Showing content immediately');
      setIsScrollRestored(true);
    }
    
    console.log('🔍 Device detection:', {
      userAgent: navigator.userAgent,
      windowWidth: window.innerWidth,
      isMobile: isMobile
    });
    
    if (isMobile) {
      console.log('📱 Mobile detected: Using radical anti-jittering approach');
      
      // Save scroll position and last read news before page unload (refresh)
      const saveScrollPosition = () => {
        const scrollY = window.scrollY;
        localStorage.setItem('luot247_scroll_position', scrollY.toString());
        
        console.log('📱 saveScrollPosition called:', {
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
          
          console.log('📱 Header info:', {
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
            
            console.log(`📱 News ${newsId}:`, {
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
          
          console.log('📱 Closest news analysis:', {
            closestNewsId: closestNewsId,
            minDistance: minDistance
          });
          
          if (closestNewsId) {
            localStorage.setItem('luot247_last_visible_news', closestNewsId);
            console.log(`📱 ✅ Saved last visible news: ${closestNewsId} at position: ${scrollY}`);
          } else {
            console.log('📱 ❌ No visible news found to save');
          }
        } else {
          console.log('📱 ❌ Header not found');
        }
        
        console.log(`📱 Saved scroll position: ${scrollY}`);
      };
      
      // RADICAL APPROACH: Hide content completely until scroll is 100% stable
      const restoreScrollPosition = () => {
        console.log('📱 restoreScrollPosition called - RADICAL MODE');
        
        const savedScrollY = localStorage.getItem('luot247_scroll_position');
        const lastVisibleNewsId = localStorage.getItem('luot247_last_visible_news');
        const readNewsIds = JSON.parse(localStorage.getItem('luot247_read_news') || '[]');
        
        console.log('📱 Restore data:', {
          savedScrollY: savedScrollY,
          lastVisibleNewsId: lastVisibleNewsId,
          readNewsCount: readNewsIds.length,
          newsItemsRefSize: newsItemsRef.current.size
        });
        
        if (savedScrollY) {
          const scrollY = parseInt(savedScrollY);
          console.log(`📱 Processing saved scroll position: ${scrollY}`);
          
          // Wait for news to load and DOM to be ready
          setTimeout(() => {
            console.log('📱 Starting RADICAL restore process after timeout');
            
            // First try to find the last visible news from before refresh
            let targetElement = null;
            
            if (lastVisibleNewsId) {
              targetElement = document.querySelector(`[data-news-id="${lastVisibleNewsId}"]`);
              console.log(`📱 Last visible news search:`, {
                newsId: lastVisibleNewsId,
                found: !!targetElement,
                element: targetElement
              });
            }
            
            // If not found, try to find the first unread news
            if (!targetElement) {
              console.log(`📱 Looking for first unread news, read count: ${readNewsIds.length}`);
              
              // Find the first news item that is not read
              newsItemsRef.current.forEach((element, newsId) => {
                if (!readNewsIds.includes(newsId) && !targetElement) {
                  targetElement = element;
                  console.log(`📱 Found first unread news: ${newsId}`);
                }
              });
            }
            
            console.log('📱 Target element:', {
              found: !!targetElement,
              element: targetElement
            });
            
            if (targetElement) {
              // Calculate target position
              const elementRect = targetElement.getBoundingClientRect();
              const headerHeight = 60; // Approximate header height
              const targetScrollY = window.scrollY + elementRect.top - headerHeight;
              const finalScrollY = Math.max(0, targetScrollY);
              
              console.log(`📱 RADICAL: Scrolling to target news:`, {
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
                
                console.log(`📱 RADICAL stability check ${stabilityChecks}:`, {
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
                  console.log(`📱 RADICAL: Stable check ${stableCount}/${requiredStableChecks}`);
                  
                  if (stableCount >= requiredStableChecks) {
                    console.log('📱 RADICAL: Position is stable, showing content');
                    // Additional delay to ensure everything is settled
                    setTimeout(() => {
                      console.log('📱 RADICAL: Final delay complete, showing content');
                      // One final check to ensure position hasn't changed
                      const finalScrollDiff = Math.abs(window.scrollY - finalScrollY);
                      if (finalScrollDiff < 10) {
                        setIsScrollRestored(true);
                      } else {
                        console.log('📱 RADICAL: Position changed during final delay, restarting stability check');
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
                  console.log('📱 RADICAL: Max stability checks reached, showing content');
                  setIsScrollRestored(true);
                } else {
                  setTimeout(checkStability, 50); // Check every 50ms
                }
              };
              
              // Start stability checking after a short delay
              setTimeout(checkStability, 100);
              
            } else {
              // Fallback: use saved scroll position
              console.log(`📱 RADICAL: No target news found, using saved position: ${scrollY}`);
              
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
                
                console.log(`📱 RADICAL fallback stability check ${stabilityChecks}:`, {
                  currentScrollY: currentScrollY,
                  targetScrollY: scrollY,
                  scrollDiff: scrollDiff,
                  positionDiff: positionDiff,
                  stableCount: stableCount,
                  lastScrollY: lastScrollY
                });
                
                if (positionDiff < 2 && scrollDiff < 10) {
                  stableCount++;
                  console.log(`📱 RADICAL fallback: Stable check ${stableCount}/${requiredStableChecks}`);
                  
                  if (stableCount >= requiredStableChecks) {
                    console.log('📱 RADICAL fallback: Position is stable, showing content');
                    setTimeout(() => {
                      console.log('📱 RADICAL fallback: Final delay complete, showing content');
                      // One final check to ensure position hasn't changed
                      const finalScrollDiff = Math.abs(window.scrollY - scrollY);
                      if (finalScrollDiff < 10) {
                        setIsScrollRestored(true);
                      } else {
                        console.log('📱 RADICAL fallback: Position changed during final delay, restarting stability check');
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
                  console.log('📱 RADICAL fallback: Max stability checks reached, showing content');
                  setIsScrollRestored(true);
                } else {
                  setTimeout(checkStability, 50);
                }
              };
              
              setTimeout(checkStability, 100);
            }
          }, 1000); // Increased delay to ensure DOM is fully ready
        } else {
          console.log('📱 No saved scroll position found');
          // No saved position, show content immediately
          console.log('📱 No saved position, showing content immediately');
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
          console.log('📱 Page becoming hidden, saving scroll position');
          saveScrollPosition();
        }
      });
      
      // Also save on scroll to ensure we capture the position
      let scrollSaveTimeout: ReturnType<typeof setTimeout>;
      const saveOnScroll = () => {
        clearTimeout(scrollSaveTimeout);
        scrollSaveTimeout = setTimeout(() => {
          console.log('📱 Auto-saving scroll position on scroll');
          saveScrollPosition();
        }, 1000);
      };
      window.addEventListener('scroll', saveOnScroll, { passive: true });
      
      // Save position periodically as backup
      const periodicSave = setInterval(() => {
        console.log('📱 Periodic save of scroll position');
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
      console.log('🖥️ Desktop detected: Using scroll detection');
      
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
            
            newsItemsRef.current.forEach((element, newsId) => {
              if (!element) return;
              
              const elementRect = element.getBoundingClientRect();
              const elementTop = elementRect.top;
              const elementBottom = elementRect.bottom;
              
              // Check if element is visible and mark as read if needed
              if (elementBottom < effectiveHeaderBottom) {
              const stored = localStorage.getItem('luot247_read_news');
              const readIds = stored ? JSON.parse(stored) : [];
              const isAlreadyRead = readIds.includes(newsId);
              
              if (!isAlreadyRead) {
                  console.log(`📖 Desktop: Marking news ${newsId} as read`);
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
              console.log(`🔄 Desktop: Synced to most visible news ${mostVisibleNewsId}`);
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
      
      console.log('📊 News check:', {
        lastNewsCount,
        currentNewsCount,
        hasNewNews,
        isFirstLoad
      });
      
      if (hasNewNews) {
        console.log('🆕 New news detected! Clearing saved position to show latest news');
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
        console.log('📰 No new news, keeping saved position');
        // Update stored news count to track
        localStorage.setItem('luot247_last_news_count', currentNewsCount.toString());
      } else {
        console.log('🆕 First load, storing initial count');
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
      console.log('🔗 Deep link detected for news:', newsId);
      
      // Mark as coming from shared link to disable auto-hide
      setIsFromSharedLink(true);
      
      // Wait for news to load
      setTimeout(() => {
        const newsElement = document.querySelector(`[data-news-id="${newsId}"]`);
        if (newsElement) {
          const headerHeight = 60;
          const targetPosition = newsElement.getBoundingClientRect().top + window.scrollY - headerHeight;
          
          window.scrollTo({
            top: targetPosition,
            behavior: 'smooth'
          });
          
          // Highlight the news item
          setHighlightedNewsId(newsId);
          
          setTimeout(() => {
            setHighlightedNewsId(null);
          }, 3000);
          
          console.log('✅ Scrolled to news:', newsId);
        } else {
          console.log('❌ News element not found:', newsId);
        }
      }, 1500);
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
            <div className={`border rounded-lg overflow-hidden bg-card ${isScrollRestored ? 'scroll-restored' : 'scroll-restoring'}`}>
            {filteredNews.filter((item) => !passedNewsIds.has(item.id)).map((item, index, arr) => (
              <div
                key={item.id}
                ref={(el) => {
                  if (el) {
                    newsItemsRef.current.set(item.id, el);
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
                />
              </div>
            ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default Index;
