import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Session } from "@supabase/supabase-js";
import { ChevronLeft, ChevronRight } from "lucide-react";

const categoryButtons = [
  { value: "kinh-te", label: "Kinh tế" },
  { value: "phap-luat", label: "Pháp luật" },
  { value: "chinh-tri", label: "Chính trị" },
  { value: "the-gioi", label: "Thế giới" },
  { value: "van-hoa-xa-hoi-khoa-hoc", label: "Văn hoá, Xã hội, Khoa học" },
];

const Classification = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [news, setNews] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [stats, setStats] = useState({
    sinceLogin: 0,
    today: 0,
    month: 0,
    lifetime: 0,
    pending: 0
  });

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) {
        navigate("/auth");
      } else {
        // Lưu timestamp đăng nhập nếu chưa có
        if (!localStorage.getItem("classificationLoginTime")) {
          localStorage.setItem("classificationLoginTime", new Date().toISOString());
        }
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) {
        navigate("/auth");
      } else {
        // Lưu timestamp đăng nhập nếu chưa có
        if (!localStorage.getItem("classificationLoginTime")) {
          localStorage.setItem("classificationLoginTime", new Date().toISOString());
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (session?.user) {
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .maybeSingle()
        .then(({ data }) => {
          const role = data?.role || null;
          setUserRole(role);
          if (role !== "admin" && role !== "moderator") {
            toast.error("Bạn không có quyền truy cập trang này");
            navigate("/");
          }
        });
    }
  }, [session, navigate]);

  useEffect(() => {
    if (session && (userRole === "admin" || userRole === "moderator")) {
      fetchNews();
      fetchStats();
    }
  }, [session, userRole]);

  const fetchNews = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("news")
      .select("*")
      .eq("category", "khac")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Không thể tải tin tức");
      console.error(error);
    } else {
      setNews(data || []);
    }
    setIsLoading(false);
  };

  const fetchStats = async () => {
    if (!session?.user) return;

    const now = new Date();
    
    // Tính thời điểm 7h sáng hôm nay (Vietnam Time)
    // JavaScript uses local timezone. For Vietnam (UTC+7), we need 7 AM = midnight UTC
    // Create at midnight local, then convert to UTC
    const today7AM = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    
    // Tính thời điểm 7h sáng ngày 1 tháng này (midnight UTC = 7 AM Vietnam)
    const firstOfMonth7AM = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));

    // Lấy timestamp đăng nhập từ localStorage
    const loginTimestamp = localStorage.getItem("classificationLoginTime");
    const loginTime = loginTimestamp ? new Date(loginTimestamp) : now;

    const [sinceLoginRes, todayRes, monthRes, lifetimeRes, pendingRes] = await Promise.all([
      // Từ khi đăng nhập
      supabase
        .from("classification_history")
        .select("id", { count: "exact", head: true })
        .eq("user_id", session.user.id)
        .gte("classified_at", loginTime.toISOString()),
      
      // Trong ngày (từ 7h sáng)
      supabase
        .from("classification_history")
        .select("id", { count: "exact", head: true })
        .eq("user_id", session.user.id)
        .gte("classified_at", today7AM.toISOString()),
      
      // Trong tháng (từ 7h sáng ngày 1)
      supabase
        .from("classification_history")
        .select("id", { count: "exact", head: true })
        .eq("user_id", session.user.id)
        .gte("classified_at", firstOfMonth7AM.toISOString()),
      
      // Lifetime
      supabase
        .from("classification_history")
        .select("id", { count: "exact", head: true })
        .eq("user_id", session.user.id),
      
      // Chưa duyệt
      supabase
        .from("news")
        .select("id", { count: "exact", head: true })
        .eq("category", "khac")
    ]);

    setStats({
      sinceLogin: sinceLoginRes.count || 0,
      today: todayRes.count || 0,
      month: monthRes.count || 0,
      lifetime: lifetimeRes.count || 0,
      pending: pendingRes.count || 0
    });
  };

  const handleCategoryChange = async (category: string) => {
    if (!news[currentIndex] || !session?.user) return;
    
    const { error } = await supabase
      .from("news")
      .update({ 
        category: category as any,
        is_approved: true  // Approve the news when category is assigned
      })
      .eq("id", news[currentIndex].id);

    if (error) {
      toast.error("Không thể cập nhật danh mục");
      console.error(error);
    } else {
      // Lưu lịch sử phân loại
      await supabase.from("classification_history").insert({
        user_id: session.user.id,
        news_id: news[currentIndex].id
      });
      
      toast.success("Đã phân loại và duyệt tin tức");
      await fetchStats(); // Cập nhật bộ đếm
      handleNext();
    }
  };

  const handleReject = async () => {
    if (!news[currentIndex] || !session?.user) return;
    
    const { error } = await supabase
      .from("news")
      .delete()
      .eq("id", news[currentIndex].id);

    if (error) {
      toast.error("Không thể xóa tin tức");
      console.error(error);
    } else {
      // Lưu lịch sử phân loại (đánh dấu là đã xử lý)
      await supabase.from("classification_history").insert({
        user_id: session.user.id,
        news_id: news[currentIndex].id
      });
      
      toast.success("Đã xóa tin tức");
      await fetchStats(); // Cập nhật bộ đếm
      handleNext();
    }
  };

  const handleNext = () => {
    if (currentIndex < news.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      fetchNews();
      fetchStats();
      setCurrentIndex(0);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleSkip = () => {
    handleNext();
  };

  const currentNews = news[currentIndex];

  if (isLoading || (userRole !== "admin" && userRole !== "moderator")) {
    return (
      <div className="min-h-screen bg-background">
        <Header user={session?.user} userRole={userRole} />
        <div className="container py-8">
          <p className="text-center">Đang tải...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header user={session?.user} userRole={userRole} />
      <main className="container max-w-4xl py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <Card className="p-4 text-center">
            <p className="text-sm text-muted-foreground mb-1">Đăng nhập</p>
            <p className="text-2xl font-bold">{stats.sinceLogin}</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-sm text-muted-foreground mb-1">Trong ngày</p>
            <p className="text-2xl font-bold text-green-600">{stats.today}</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-sm text-muted-foreground mb-1">Trong tháng</p>
            <p className="text-2xl font-bold text-purple-600">{stats.month}</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-sm text-muted-foreground mb-1">Từ đầu</p>
            <p className="text-2xl font-bold text-amber-600">{stats.lifetime}</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-sm text-muted-foreground mb-1">Chưa duyệt</p>
            <p className="text-2xl font-bold text-red-600">{stats.pending}</p>
          </Card>
        </div>

        {news.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            Không có tin tức nào cần phân loại
          </Card>
        ) : currentNews ? (
          <div className="space-y-6">
            {/* News Content */}
            <Card className="p-8">
              <div className="prose max-w-none">
                <p className="text-lg leading-relaxed whitespace-pre-wrap">
                  {currentNews.title}
                </p>
              </div>
            </Card>

            {/* Category Buttons */}
            <div className="flex flex-wrap gap-3 justify-center">
              {categoryButtons.map((cat) => (
                <Button
                  key={cat.value}
                  variant="outline"
                  onClick={() => handleCategoryChange(cat.value)}
                  className="px-6 py-2"
                >
                  {cat.label}
                </Button>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 justify-center">
              <Button
                variant="outline"
                size="lg"
                onClick={handlePrevious}
                disabled={currentIndex === 0}
                className="min-w-[140px]"
              >
                <ChevronLeft className="mr-2 h-4 w-4" />
                QUAY LẠI
              </Button>
              <Button
                variant="destructive"
                size="lg"
                onClick={handleReject}
                className="min-w-[140px]"
              >
                KHÔNG DUYỆT
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={handleSkip}
                className="min-w-[140px]"
              >
                BỎ QUA
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>

            {/* Progress Indicator */}
            <p className="text-center text-sm text-muted-foreground">
              Tin {currentIndex + 1} / {news.length}
            </p>
          </div>
        ) : null}
      </main>
    </div>
  );
};

export default Classification;
