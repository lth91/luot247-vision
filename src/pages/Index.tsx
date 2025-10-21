import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { NewsCard } from "@/components/NewsCard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { toast } from "sonner";

const categoryLabels = {
  all: "Tất cả",
  "chinh-tri": "Chính trị",
  "kinh-te": "Kinh tế",
  "xa-hoi": "Xã hội",
  "the-thao": "Thể thao",
  "giai-tri": "Giải trí",
  "cong-nghe": "Công nghệ",
};

const Index = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [news, setNews] = useState<any[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [selectedCategory, setSelectedCategory] = useState("all");
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

      fetchFavorites();
    } else {
      setUserRole(null);
      setFavorites(new Set());
    }
  }, [session]);

  useEffect(() => {
    fetchNews();
  }, [selectedCategory]);

  const fetchNews = async () => {
    setIsLoading(true);
    let query = supabase
      .from("news")
      .select("*")
      .order("created_at", { ascending: false });

    if (selectedCategory !== "all") {
      query = query.eq("category", selectedCategory as any);
    }

    const { data, error } = await query;

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
      <Header user={session?.user} userRole={userRole} />

      {/* Hero Section */}
      <section className="bg-gradient-hero py-12 text-white">
        <div className="container">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Tin tức nhanh, chính xác
          </h1>
          <p className="text-lg md:text-xl opacity-90 max-w-2xl">
            Cập nhật tin tức mới nhất từ nhiều lĩnh vực: Chính trị, Kinh tế, Xã hội, Thể thao và nhiều hơn nữa
          </p>
        </div>
      </section>

      <main className="container py-8">
        {/* Category Filter */}
        <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="mb-8">
          <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
            {Object.entries(categoryLabels).map(([value, label]) => (
              <TabsTrigger key={value} value={value}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* News Grid */}
        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Đang tải tin tức...</p>
          </div>
        ) : news.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Không có tin tức nào</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {news.map((item) => (
              <NewsCard
                key={item.id}
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
            ))}
          </div>
        )}

        {/* About Section */}
        <section className="mt-16 py-12 border-t">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl font-bold mb-4">Về chúng tôi</h2>
            <p className="text-muted-foreground leading-relaxed">
              LUOT247 là nền tảng tin tức cập nhật liên tục 24/7, mang đến cho bạn những thông tin
              mới nhất, chính xác nhất từ nhiều lĩnh vực khác nhau. Chúng tôi cam kết cung cấp tin tức
              khách quan, trung thực và kịp thời để bạn luôn nắm bắt được những diễn biến quan trọng.
            </p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t py-8 mt-16">
        <div className="container text-center text-sm text-muted-foreground">
          <p>&copy; 2025 LUOT247. Mọi quyền được bảo lưu.</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
