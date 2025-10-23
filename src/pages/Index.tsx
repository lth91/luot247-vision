import { useEffect, useState, useRef } from "react";
import { Header } from "@/components/Header";
import { NewsItem } from "@/components/NewsItem";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import { useReadingContext } from "@/contexts/ReadingContext";

const Index = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [showReadNews, setShowReadNews] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
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
    setCurrentNewsIndex
  } = useReadingContext();

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
    
    // Record a view when user visits the website
    recordPageView();
    
    // Mark as no longer initial load
    setIsInitialLoad(false);
    console.log('🚀 Page load complete - isInitialLoad = false');
    
    // Expose clear function to window for debugging
    (window as any).clearReadNews = clearReadNews;
  }, []);

  const recordPageView = async () => {
    try {
      // Insert a view log record for website visit (no specific news_id)
      await supabase.from("view_logs").insert({
        viewed_at: new Date().toISOString()
      });
      console.log('✅ Page view recorded');
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

  // Sync current index when scrolling in scroll mode
  const syncCurrentIndex = (newsId: string) => {
    const index = filteredNews.findIndex(item => item.id === newsId);
    if (index !== -1) {
      setCurrentNewsIndex(index);
      console.log(`🔄 Synced current index to ${index} for news ${newsId}`);
    }
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
                syncCurrentIndex(newsId); // Sync index when marking as read
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
            {filteredNews.map((item, index) => (
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
                  createdAt={item.created_at}
                  isFavorite={favorites.has(item.id)}
                  onFavoriteToggle={fetchFavorites}
                  isAuthenticated={!!session}
                  isLast={index === filteredNews.length - 1}
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
