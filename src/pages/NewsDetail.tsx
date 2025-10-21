import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Eye, Heart, Share2, Copy } from "lucide-react";
import { toast } from "sonner";
import { Session } from "@supabase/supabase-js";

const categoryLabels: Record<string, string> = {
  "chinh-tri": "Chính trị",
  "kinh-te": "Kinh tế",
  "xa-hoi": "Xã hội",
  "the-thao": "Thể thao",
  "giai-tri": "Giải trí",
  "cong-nghe": "Công nghệ",
  "khac": "Khác",
};

const NewsDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [news, setNews] = useState<any>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
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

      // Increment view count
      await supabase.rpc("increment_view_count", { news_id_param: id });

      // Check if favorited
      if (session?.user) {
        const { data: favData } = await supabase
          .from("favorites")
          .select("id")
          .eq("news_id", id)
          .eq("user_id", session.user.id)
          .maybeSingle();
        setIsFavorite(!!favData);
      }

      setIsLoading(false);
    };

    fetchNews();
  }, [id, navigate, session]);

  const handleFavorite = async () => {
    if (!session?.user) {
      toast.error("Vui lòng đăng nhập");
      return;
    }

    try {
      if (isFavorite) {
        await supabase.from("favorites").delete().eq("news_id", id);
        toast.success("Đã xóa khỏi yêu thích");
      } else {
        await supabase.from("favorites").insert({ news_id: id, user_id: session.user.id });
        toast.success("Đã thêm vào yêu thích");
      }
      setIsFavorite(!isFavorite);
    } catch (error) {
      toast.error("Có lỗi xảy ra");
    }
  };

  const handleShare = async () => {
    try {
      await navigator.share({
        title: news?.title,
        text: news?.description,
        url: window.location.href,
      });
    } catch (error) {
      handleCopy();
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(window.location.href);
    toast.success("Đã sao chép liên kết");
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
      <main className="container py-8">
        <Button variant="ghost" onClick={() => navigate("/")} className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Quay lại
        </Button>

        <article className="max-w-4xl mx-auto">
          <div className="mb-6">
            <Badge variant="secondary" className="mb-3">
              {categoryLabels[news.category] || news.category}
            </Badge>
            <h1 className="text-3xl md:text-4xl font-bold mb-4">{news.title}</h1>
            
            <div className="flex items-center gap-6 text-sm text-muted-foreground mb-6">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                <span>{news.view_count.toLocaleString("vi-VN")} lượt xem</span>
              </div>
              <span>{new Date(news.created_at).toLocaleDateString("vi-VN", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}</span>
            </div>

            <div className="flex gap-2 mb-8">
              <Button onClick={handleFavorite} variant="outline">
                <Heart className={`mr-2 h-4 w-4 ${isFavorite ? "fill-destructive text-destructive" : ""}`} />
                {isFavorite ? "Đã lưu" : "Lưu tin"}
              </Button>
              <Button onClick={handleShare} variant="outline">
                <Share2 className="mr-2 h-4 w-4" />
                Chia sẻ
              </Button>
              <Button onClick={handleCopy} variant="outline">
                <Copy className="mr-2 h-4 w-4" />
                Sao chép
              </Button>
            </div>
          </div>

          <div className="prose prose-slate max-w-none">
            <p className="text-lg leading-relaxed">{news.description}</p>
            
            {news.url && (
              <div className="mt-8 p-4 bg-muted rounded-lg">
                <p className="font-medium mb-2">Nguồn gốc:</p>
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
          </div>
        </article>
      </main>
    </div>
  );
};

export default NewsDetail;
