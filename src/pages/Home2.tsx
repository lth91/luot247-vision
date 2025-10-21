import { useEffect, useState, useRef } from "react";
import { Header } from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ThumbsUp, ThumbsDown, Share2, Search } from "lucide-react";

const Home2 = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [news, setNews] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [readNewsIds, setReadNewsIds] = useState<Set<string>>(new Set());
  const [showHiddenNews, setShowHiddenNews] = useState(false);
  const newsRef = useRef<HTMLDivElement>(null);

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
    } else {
      setUserRole(null);
    }
  }, [session]);

  useEffect(() => {
    fetchNews();
    // Load read news IDs from localStorage (same key as Index page)
    const savedReadNews = localStorage.getItem("readNewsIds");
    if (savedReadNews) {
      setReadNewsIds(new Set(JSON.parse(savedReadNews)));
    }
  }, []);

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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        handleNext();
      } else if (event.key === "ArrowLeft") {
        handlePrevious();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, news.length]);

  // Filter news based on read status (same logic as Index page)
  const filteredNews = showHiddenNews 
    ? news 
    : news.filter((item) => !readNewsIds.has(item.id));

  const currentNews = filteredNews[currentIndex];

  // Reset index if it's out of bounds
  useEffect(() => {
    if (filteredNews.length > 0 && currentIndex >= filteredNews.length) {
      setCurrentIndex(0);
    }
  }, [filteredNews.length, currentIndex]);

  const handleNext = () => {
    if (currentIndex < filteredNews.length - 1) {
      // Mark current news as read before moving to next
      if (currentNews) {
        setReadNewsIds((prev) => {
          const updated = new Set(prev);
          updated.add(currentNews.id);
          localStorage.setItem("readNewsIds", JSON.stringify(Array.from(updated)));
          return updated;
        });
      }
      setCurrentIndex(currentIndex + 1);
      setLiked(false);
      setDisliked(false);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      // Mark current news as read before moving to previous
      if (currentNews) {
        setReadNewsIds((prev) => {
          const updated = new Set(prev);
          updated.add(currentNews.id);
          localStorage.setItem("readNewsIds", JSON.stringify(Array.from(updated)));
          return updated;
        });
      }
      setCurrentIndex(currentIndex - 1);
      setLiked(false);
      setDisliked(false);
    }
  };

  const handleLike = () => {
    if (!session) {
      toast.error("Vui lòng đăng nhập");
      return;
    }
    setLiked(!liked);
    setDisliked(false);
  };

  const handleDislike = () => {
    if (!session) {
      toast.error("Vui lòng đăng nhập");
      return;
    }
    setDisliked(!disliked);
    setLiked(false);
  };

  const handleShare = async () => {
    if (!currentNews) return;
    const shareUrl = `${window.location.origin}/tin/${currentNews.id}`;
    await navigator.clipboard.writeText(shareUrl);
    toast.success("Đã sao chép liên kết");
  };

  const handleSearch = () => {
    toast.info("Tính năng tìm kiếm đang phát triển");
  };

  const handleShowAllNews = () => {
    setShowHiddenNews(true);
  };

  const handleClearReadNews = () => {
    setReadNewsIds(new Set());
    setCurrentIndex(0);
    localStorage.removeItem("readNewsIds");
    setShowHiddenNews(false);
    toast.success("Đã xóa danh sách tin đã đọc");
  };

  const timeAgo = () => {
    if (!currentNews) return "";
    const now = new Date();
    const created = new Date(currentNews.created_at);
    const diffMs = now.getTime() - created.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffHours < 1) return "Vừa xong";
    if (diffHours < 24) return `${diffHours} giờ trước`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} ngày trước`;
  };

  // Get current news based on filtered list
  const displayNews = filteredNews;
  const displayCurrentNews = displayNews[currentIndex];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header 
        user={session?.user} 
        userRole={userRole}
        onShowAllNews={handleShowAllNews}
        onClearReadNews={handleClearReadNews}
      />

      <main className="flex-1 w-full max-w-4xl mx-auto px-4" style={{ paddingTop: '10px', paddingBottom: '10px' }}>
        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Đang tải tin tức...</p>
          </div>
        ) : displayNews.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {showHiddenNews ? "Không có tin tức nào" : "Không có tin mới. Tất cả tin đã được đọc."}
            </p>
          </div>
        ) : displayCurrentNews ? (
          <div className="h-full">
            {/* Main content area - fixed height */}
            <div 
              ref={newsRef}
              className="bg-card rounded-lg border flex flex-col" 
              style={{ height: 'calc(100vh - 76px)' }}
            >
              <div className="flex-1 overflow-y-auto p-12">
                <h1 className="text-4xl font-bold leading-relaxed mb-8">
                  {displayCurrentNews.title}
                </h1>
                {displayCurrentNews.description && (
                  <p className="text-muted-foreground text-xl leading-relaxed">
                    {displayCurrentNews.description}
                  </p>
                )}
              </div>

              {/* Action buttons and timestamp - pinned to bottom */}
              <div className="p-6 bg-card">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2"
                      onClick={handleLike}
                    >
                      <ThumbsUp className={`h-4 w-4 ${liked ? "fill-current" : ""}`} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2"
                      onClick={handleDislike}
                    >
                      <ThumbsDown className={`h-4 w-4 ${disliked ? "fill-current" : ""}`} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2"
                      onClick={handleShare}
                    >
                      <Share2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2"
                      onClick={handleSearch}
                    >
                      <Search className="h-4 w-4" />
                    </Button>
                  </div>

                  <span className="text-sm text-muted-foreground">
                    {timeAgo()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
};

export default Home2;
