import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { ThumbsUp, ThumbsDown, Share2, Search } from "lucide-react";
import { toast } from "sonner";
import { Session } from "@supabase/supabase-js";

const NewsDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [news, setNews] = useState<any>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

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
    const fetchNews = async () => {
      if (!id) return;

      setIsLoading(true);
      const { data, error } = await supabase
        .from("news")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error || !data) {
        toast.error("Không tìm thấy tin tức");
        navigate("/");
        return;
      }

      setNews(data);
      await supabase.rpc("increment_view_count", { news_id_param: id });
      setIsLoading(false);
    };

    fetchNews();
  }, [id, navigate]);

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
    await navigator.clipboard.writeText(window.location.href);
    toast.success("Đã sao chép liên kết");
  };

  const handleSearch = () => {
    toast.info("Tính năng tìm kiếm đang phát triển");
  };

  const timeAgo = () => {
    if (!news) return "";
    const now = new Date();
    const created = new Date(news.created_at);
    const diffMs = now.getTime() - created.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffHours < 1) return "Vừa xong";
    if (diffHours < 24) return `${diffHours} giờ trước`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} ngày trước`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header user={session?.user} userRole={userRole} />
        <div className="container py-8">
          <p className="text-center">Đang tải...</p>
        </div>
      </div>
    );
  }

  if (!news) return null;

  return (
    <div className="min-h-screen bg-background">
      <Header user={session?.user} userRole={userRole} />
      
      <main className="w-full">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <article className="bg-card rounded-lg p-8 shadow-sm">
            <h1 className="text-2xl md:text-3xl font-normal leading-relaxed mb-8">
              {news.title}
            </h1>
            
            {news.description && (
              <div className="prose prose-lg max-w-none mb-8">
                <p className="text-base leading-relaxed whitespace-pre-wrap">
                  {news.description}
                </p>
              </div>
            )}

            {news.url && (
              <div className="mt-8 p-4 bg-muted/50 rounded text-sm">
                <p className="font-medium mb-1">Nguồn:</p>
                <a 
                  href={news.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline break-all"
                >
                  {news.url}
                </a>
              </div>
            )}
          </article>

          <div className="flex items-center justify-between mt-8 px-8">
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
      </main>
    </div>
  );
};

export default NewsDetail;
