import { useEffect, useState, useRef } from "react";
import { Header } from "@/components/Header";
import { NewsItem } from "@/components/NewsItem";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import Cookies from "js-cookie";

const Index = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [news, setNews] = useState<any[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [readNewsIds, setReadNewsIds] = useState<Set<string>>(new Set());
  const [showHiddenNews, setShowHiddenNews] = useState(false);
  const newsRefs = useRef<Map<string, HTMLDivElement>>(new Map());

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
    // Load read news IDs from localStorage
    const savedReadNews = localStorage.getItem("readNewsIds");
    if (savedReadNews) {
      setReadNewsIds(new Set(JSON.parse(savedReadNews)));
    }
  }, []);

  useEffect(() => {
    // Track when news items scroll past the header (56px)
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const newsId = entry.target.getAttribute("data-news-id");
          if (newsId && !entry.isIntersecting && entry.boundingClientRect.top < 56) {
            // News item has scrolled past the header
            setReadNewsIds((prev) => {
              const updated = new Set(prev);
              updated.add(newsId);
              // Save to localStorage
              localStorage.setItem("readNewsIds", JSON.stringify(Array.from(updated)));
              return updated;
            });
          }
        });
      },
      {
        threshold: 0,
        rootMargin: "-56px 0px 0px 0px", // Header height offset
      }
    );

    // Observe all news items
    newsRefs.current.forEach((element) => {
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [news]);

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

  const handleShowAllNews = () => {
    setShowHiddenNews(true);
  };

  const handleClearReadNews = () => {
    setReadNewsIds(new Set());
    localStorage.removeItem("readNewsIds");
    setShowHiddenNews(false);
    toast.success("Đã xóa danh sách tin đã đọc");
  };

  // Filter news based on read status
  const filteredNews = showHiddenNews 
    ? news 
    : news.filter((item) => !readNewsIds.has(item.id));

  return (
    <div className="min-h-screen bg-background">
      <Header 
        user={session?.user} 
        userRole={userRole}
        onShowAllNews={handleShowAllNews}
        onClearReadNews={handleClearReadNews}
      />

      <main className="w-full max-w-2xl mx-auto px-4 py-4">
        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Đang tải tin tức...</p>
          </div>
        ) : filteredNews.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {showHiddenNews ? "Không có tin tức nào" : "Không có tin mới. Tất cả tin đã được đọc."}
            </p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden bg-card">
            {filteredNews.map((item) => (
              <div
                key={item.id}
                ref={(el) => {
                  if (el) newsRefs.current.set(item.id, el);
                }}
                data-news-id={item.id}
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
