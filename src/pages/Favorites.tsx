import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { NewsItem } from "@/components/NewsItem";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface NewsData {
  id: string;
  title: string;
  description: string;
  category: string;
  view_count: number;
  url: string;
  created_at: string;
}

const Favorites = () => {
  console.log("🔍 Favorites component loaded");
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<NewsData[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
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
    if (!session) {
      navigate("/auth");
      return;
    }

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
    }
  }, [session, navigate]);

  const fetchFavorites = async () => {
    if (!session?.user) return;

    try {
      setIsLoading(true);
      const { data: favData, error: favError } = await supabase
        .from("favorites")
        .select("news_id")
        .eq("user_id", session.user.id);

      if (favError) throw favError;

      const newsIds = favData?.map((f) => f.news_id) || [];
      setFavoriteIds(new Set(newsIds));

      if (newsIds.length === 0) {
        setFavorites([]);
        setIsLoading(false);
        return;
      }

      const { data: newsData, error: newsError } = await supabase
        .from("news")
        .select("*")
        .in("id", newsIds)
        .order("created_at", { ascending: false });

      if (newsError) throw newsError;

      setFavorites(newsData || []);
    } catch (error) {
      console.error("Error fetching favorites:", error);
      toast.error("Không thể tải danh sách yêu thích");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFavoriteToggle = async (newsId: string, isFavorite: boolean) => {
    if (!session?.user) {
      toast.error("Vui lòng đăng nhập");
      return;
    }

    try {
      if (isFavorite) {
        const { error } = await supabase
          .from("favorites")
          .delete()
          .eq("user_id", session.user.id)
          .eq("news_id", newsId);

        if (error) throw error;

        setFavoriteIds((prev) => {
          const updated = new Set(prev);
          updated.delete(newsId);
          return updated;
        });
        setFavorites((prev) => prev.filter((news) => news.id !== newsId));
        toast.success("Đã xóa khỏi danh sách yêu thích");
      }
    } catch (error) {
      console.error("Error toggling favorite:", error);
      toast.error("Có lỗi xảy ra");
    }
  };

  const handleClearAll = async () => {
    if (!session?.user) return;

    try {
      const { error } = await supabase
        .from("favorites")
        .delete()
        .eq("user_id", session.user.id);

      if (error) throw error;

      setFavorites([]);
      setFavoriteIds(new Set());
      toast.success("Đã xóa toàn bộ danh sách yêu thích");
    } catch (error) {
      console.error("Error clearing all favorites:", error);
      toast.error("Có lỗi xảy ra");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header user={session?.user} userRole={userRole} />
        <div className="container py-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
              <p className="text-muted-foreground">Đang tải...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header user={session?.user} userRole={userRole} />
      
      {/* Title and Clear All Button */}
      <div className="w-full border-b bg-background sticky top-[60px] z-10">
        <div className="container py-4">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-2xl font-bold text-primary">Danh sách yêu thích</h1>
            
            {favorites.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" className="shrink-0">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Xóa tất cả
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Xác nhận xóa</AlertDialogTitle>
                    <AlertDialogDescription>
                      Bạn có chắc chắn muốn xóa toàn bộ danh sách yêu thích? 
                      Hành động này không thể hoàn tác.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Hủy</AlertDialogCancel>
                    <AlertDialogAction onClick={handleClearAll}>
                      Xóa tất cả
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
          
          <p className="text-sm text-muted-foreground mt-2">
            {favorites.length > 0
              ? `Bạn có ${favorites.length} tin yêu thích`
              : "Chưa có tin nào trong danh sách yêu thích"}
          </p>
        </div>
      </div>

      <div className="container py-8">

        {favorites.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">❤️</div>
            <h3 className="text-xl font-semibold mb-2">Danh sách trống</h3>
            <p className="text-muted-foreground mb-4">
              Bạn chưa có tin yêu thích nào. Hãy thêm tin bạn quan tâm!
            </p>
            <button
              onClick={() => navigate("/")}
              className="text-primary hover:underline"
            >
              Về trang chủ
            </button>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden bg-card">
            {favorites.map((news, index) => (
              <NewsItem
                key={news.id}
                id={news.id}
                title={news.title}
                description={news.description}
                category={news.category}
                viewCount={news.view_count}
                url={news.url}
                createdAt={news.created_at}
                isFavorite={favoriteIds.has(news.id)}
                onFavoriteToggle={() => handleFavoriteToggle(news.id, true)}
                isAuthenticated={!!session}
                isLast={index === favorites.length - 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Favorites;
