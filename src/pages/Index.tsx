import { useEffect, useState, useRef } from "react";
import { Header } from "@/components/Header";
import { NewsItem } from "@/components/NewsItem";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { toast } from "sonner";

const Index = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [news, setNews] = useState<any[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [readNewsIds, setReadNewsIds] = useState<Set<string>>(new Set());
  const [showReadNews, setShowReadNews] = useState(false);
  const [shouldHideReadNews, setShouldHideReadNews] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const newsItemsRef = useRef<Map<string, HTMLDivElement>>(new Map());

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

      fetchFavorites();
    } else {
      setUserRole(null);
      setFavorites(new Set());
    }
  }, [session]);

  useEffect(() => {
    fetchNews();
    loadReadNewsFromStorage();
    
    // Only hide read news on initial page load if there are read news in localStorage
    const stored = localStorage.getItem('luot247_read_news');
    console.log('🚀 Initial page load - checking localStorage:', stored);
    if (stored) {
      const readIds = JSON.parse(stored);
      if (readIds.length > 0) {
        console.log('🚀 Setting shouldHideReadNews = true (found', readIds.length, 'read news)');
        setShouldHideReadNews(true);
      } else {
        console.log('🚀 Setting shouldHideReadNews = false (no read news)');
        setShouldHideReadNews(false);
      }
    } else {
      console.log('🚀 Setting shouldHideReadNews = false (no localStorage)');
      setShouldHideReadNews(false);
    }
    
    // Mark as no longer initial load
    setIsInitialLoad(false);
    console.log('🚀 Page load complete - isInitialLoad = false');
    
    // Expose clear function to window for debugging
    (window as any).clearReadNews = clearReadNews;
  }, []);

  // Load read news from localStorage
  const loadReadNewsFromStorage = () => {
    try {
      const stored = localStorage.getItem('luot247_read_news');
      console.log('🔍 Loading from localStorage:', stored);
      if (stored) {
        const readIds = JSON.parse(stored);
        setReadNewsIds(new Set(readIds));
        console.log('📚 Loaded read news IDs:', readIds);
        console.log('📚 Loaded read news count:', readIds.length);
      } else {
        console.log('📚 No read news in localStorage');
      }
    } catch (error) {
      console.error('❌ Error loading read news from storage:', error);
    }
  };

  // Save read news to localStorage
  const saveReadNewsToStorage = (readIds: Set<string>) => {
    try {
      const idsArray = [...readIds];
      localStorage.setItem('luot247_read_news', JSON.stringify(idsArray));
      console.log('💾 Saved to localStorage:', idsArray);
      console.log('💾 Saved count:', idsArray.length);
    } catch (error) {
      console.error('❌ Error saving read news to storage:', error);
    }
  };

  // Mark news as read
  const markNewsAsRead = (newsId: string) => {
    console.log('📖 Marking news as read:', newsId);
    setReadNewsIds(prev => {
      const newSet = new Set(prev);
      newSet.add(newsId);
      console.log('📖 Updated read news set:', [...newSet]);
      saveReadNewsToStorage(newSet);
      return newSet;
    });
  };

  // Effect to prevent hiding news during scroll
  useEffect(() => {
    // Once shouldHideReadNews is set, never change it during scroll
    // This ensures news don't disappear while scrolling
  }, [shouldHideReadNews]);

  // Debug effect to log state changes
  useEffect(() => {
    console.log('🔄 State changed - showReadNews:', showReadNews, 'shouldHideReadNews:', shouldHideReadNews, 'readNewsIds count:', readNewsIds.size);
    
    // Log which news items are being hidden
    if (shouldHideReadNews && !showReadNews) {
      const hiddenCount = news.filter(item => readNewsIds.has(item.id)).length;
      console.log(`👁️ Hiding ${hiddenCount} read news items`);
    } else {
      console.log('👁️ Showing all news items');
    }
  }, [showReadNews, shouldHideReadNews, readNewsIds, news]);

  // Clear all read news (for debugging)
  const clearReadNews = () => {
    console.log('🔄 Clearing all read news');
    localStorage.removeItem('luot247_read_news');
    setReadNewsIds(new Set());
    setShouldHideReadNews(false);
    console.log('🔄 Cleared all read news');
    toast.success('Đã reset toàn bộ tin đã đọc');
  };

  // Scroll detection effect - only run when user actually scrolls
  useEffect(() => {
    let isScrolling = false;
    
    const handleScroll = () => {
      if (!isScrolling) {
        isScrolling = true;
        requestAnimationFrame(() => {
          const header = document.querySelector('header');
          if (!header) return;

          const headerRect = header.getBoundingClientRect();
          const headerBottom = headerRect.bottom;

          // Check each news item
          newsItemsRef.current.forEach((element, newsId) => {
            if (!element) return;
            
            const elementRect = element.getBoundingClientRect();
            const elementBottom = elementRect.bottom;
            
            // If news item is completely above header (scrolled past), mark as read
            // Use a ref to get current readNewsIds to avoid dependency issues
            if (elementBottom < headerBottom) {
              // Check if already read by looking at localStorage directly to avoid stale closure
              const stored = localStorage.getItem('luot247_read_news');
              const readIds = stored ? JSON.parse(stored) : [];
              const isAlreadyRead = readIds.includes(newsId);
              
              if (!isAlreadyRead) {
                console.log(`📖 Marking news ${newsId} as read - element bottom: ${elementBottom}, header bottom: ${headerBottom}`);
                markNewsAsRead(newsId);
              }
            }
          });
          
          isScrolling = false;
        });
      }
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []); // Remove readNewsIds dependency to prevent recreation

  const fetchNews = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("news")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Không thể tải tin tức");
      console.error(error);
    } else {
      setNews(data || []);
    }
    setIsLoading(false);
  };


  const fetchFavorites = async () => {
    if (!session?.user) return;

    const { data, error } = await supabase
      .from("favorites")
      .select("news_id")
      .eq("user_id", session.user.id);

    if (!error && data) {
      setFavorites(new Set(data.map((f) => f.news_id)));
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
            <p className="text-muted-foreground">Đang tải tin tức...</p>
          </div>
        ) : news.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Không có tin tức nào</p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden bg-card">
            {news.map((item, index) => (
              <div
                key={item.id}
                ref={(el) => {
                  if (el) {
                    newsItemsRef.current.set(item.id, el);
                  }
                }}
                style={{
                  display: (!showReadNews && readNewsIds.has(item.id) && shouldHideReadNews) ? 'none' : 'block'
                }}
                data-debug={`showReadNews: ${showReadNews}, isRead: ${readNewsIds.has(item.id)}, shouldHide: ${shouldHideReadNews}, display: ${(!showReadNews && readNewsIds.has(item.id) && shouldHideReadNews) ? 'none' : 'block'}`}
              >
                <NewsItem
                  id={item.id}
                  title={item.title}
                  description={item.description || ""}
                  category={item.category}
                  viewCount={item.view_count || 0}
                  url={item.url}
                  createdAt={item.created_at}
                  isFavorite={favorites.has(item.id)}
                  onFavoriteToggle={fetchFavorites}
                  isAuthenticated={!!session}
                  isLast={index === news.length - 1}
                />
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
