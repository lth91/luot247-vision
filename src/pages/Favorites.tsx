import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { NewsItem } from "@/components/NewsItem";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Trash2, ArrowUpDown } from "lucide-react";
import { useFavorites } from "@/contexts/FavoritesContext";
import { useReadingContext } from "@/contexts/ReadingContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  liked_at?: string; // Thời gian like
}

type SortOption = 'like_time_desc' | 'like_time_asc' | 'news_time_desc' | 'news_time_asc';

const Favorites = () => {
  console.log("🔍 Favorites component loaded");
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<NewsData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>('like_time_desc');
  
  // Use FavoritesContext
  const { favoriteIds, favoriteData, loadFavorites } = useFavorites();
  
  // Use ReadingContext to disable shouldHideReadNews for Favorites page
  const { setShouldHideReadNews } = useReadingContext();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setSessionChecked(true);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setSessionChecked(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Disable shouldHideReadNews when entering Favorites page
  useEffect(() => {
    setShouldHideReadNews(false);
    
    // Cleanup: re-enable when leaving Favorites page
    return () => {
      // Don't re-enable automatically - let user control this
    };
  }, [setShouldHideReadNews]);

  useEffect(() => {
    // Only redirect after session has been checked
    if (!sessionChecked) return;
    
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
  }, [session, sessionChecked, navigate]);

  // Fetch favorites when favoriteIds or favoriteData change
  useEffect(() => {
    if (favoriteIds.size > 0 && favoriteData.length > 0) {
      fetchFavorites();
    } else {
      setFavorites([]);
      setIsLoading(false);
    }
  }, [favoriteIds, favoriteData]);

  const fetchFavorites = async () => {
    if (!session?.user || favoriteIds.size === 0) {
      setFavorites([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const newsIds = Array.from(favoriteIds);

      const { data: newsData, error: newsError } = await supabase
        .from("news")
        .select("*")
        .in("id", newsIds);

      if (newsError) throw newsError;

      // Merge news data with like time
      const mergedData = (newsData || []).map(news => {
        const favoriteInfo = favoriteData.find(fav => fav.news_id === news.id);
        return {
          ...news,
          liked_at: favoriteInfo?.created_at
        };
      });

      setFavorites(mergedData);
    } catch (error) {
      console.error("Error fetching favorites:", error);
      toast.error("Không thể tải danh sách yêu thích");
    } finally {
      setIsLoading(false);
    }
  };

  // Sort favorites based on selected option
  const sortedFavorites = [...favorites].sort((a, b) => {
    switch (sortOption) {
      case 'like_time_desc':
        return new Date(b.liked_at || 0).getTime() - new Date(a.liked_at || 0).getTime();
      case 'like_time_asc':
        return new Date(a.liked_at || 0).getTime() - new Date(b.liked_at || 0).getTime();
      case 'news_time_desc':
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case 'news_time_asc':
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      default:
        return 0;
    }
  });

  const getSortLabel = (option: SortOption) => {
    switch (option) {
      case 'like_time_desc':
        return 'Thời gian like (mới nhất)';
      case 'like_time_asc':
        return 'Thời gian like (cũ nhất)';
      case 'news_time_desc':
        return 'Thời gian lên tin (mới nhất)';
      case 'news_time_asc':
        return 'Thời gian lên tin (cũ nhất)';
      default:
        return 'Sắp xếp';
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

      // Reload favorites from context
      await loadFavorites();
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
      
      {/* Title and Controls */}
      <div className="w-full border-b bg-background sticky top-[60px] z-10">
        <div className="container py-4">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-2xl font-bold text-primary">Danh sách yêu thích</h1>
            
            <div className="flex items-center gap-3">
              {/* Sort Dropdown */}
              <div className="flex items-center gap-2">
                <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                <Select value={sortOption} onValueChange={(value: SortOption) => setSortOption(value)}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Sắp xếp" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="like_time_desc">Thời gian like (mới nhất)</SelectItem>
                    <SelectItem value="like_time_asc">Thời gian like (cũ nhất)</SelectItem>
                    <SelectItem value="news_time_desc">Thời gian lên tin (mới nhất)</SelectItem>
                    <SelectItem value="news_time_asc">Thời gian lên tin (cũ nhất)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Clear All Button */}
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
          </div>
          
          <p className="text-sm text-muted-foreground mt-2">
            {favorites.length > 0
              ? `Bạn có ${favorites.length} tin yêu thích • ${getSortLabel(sortOption)}`
              : "Chưa có tin nào trong danh sách yêu thích"}
          </p>
        </div>
      </div>

      <div className="container py-8">

        {sortedFavorites.length === 0 ? (
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
            {sortedFavorites.map((news, index) => (
              <NewsItem
                key={news.id}
                id={news.id}
                title={news.title}
                description={news.description}
                category={news.category}
                viewCount={news.view_count}
                url={news.url}
                createdAt={news.created_at}
                isAuthenticated={!!session}
                isLast={index === sortedFavorites.length - 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Favorites;
