import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ThumbsUp, ThumbsDown, Share2, Search, ChevronLeft, ChevronRight } from "lucide-react";

const Home2 = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [news, setNews] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);

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

  const currentNews = news[currentIndex];

  const handleNext = () => {
    if (currentIndex < news.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setLiked(false);
      setDisliked(false);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
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

  return (
    <div className="min-h-screen bg-background">
      <Header user={session?.user} userRole={userRole} />

      <main className="w-full max-w-4xl mx-auto px-4 py-8">
        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Đang tải tin tức...</p>
          </div>
        ) : news.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Không có tin tức nào</p>
          </div>
        ) : currentNews ? (
          <div className="space-y-8">
            {/* Main content area */}
            <div className="bg-card rounded-lg border p-8 min-h-[500px]">
              <h1 className="text-3xl font-bold leading-relaxed mb-6">
                {currentNews.title}
              </h1>
              {currentNews.description && (
                <p className="text-muted-foreground text-lg leading-relaxed">
                  {currentNews.description}
                </p>
              )}
            </div>

            {/* Action buttons */}
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

            {/* Navigation */}
            <div className="flex items-center justify-center gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrevious}
                disabled={currentIndex === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Trước
              </Button>
              <span className="text-sm text-muted-foreground">
                {currentIndex + 1} / {news.length}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNext}
                disabled={currentIndex === news.length - 1}
              >
                Sau
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
};

export default Home2;
