import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Session } from "@supabase/supabase-js";

const categoryLabels = {
  "chinh-tri": "Chính trị",
  "kinh-te": "Kinh tế",
  "xa-hoi": "Xã hội",
  "the-thao": "Thể thao",
  "giai-tri": "Giải trí",
  "cong-nghe": "Công nghệ",
  "khac": "Khác",
};

const Classification = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [news, setNews] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) {
        navigate("/auth");
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) {
        navigate("/auth");
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
          if (role !== "admin") {
            toast.error("Bạn không có quyền truy cập trang này");
            navigate("/");
          }
        });
    }
  }, [session, navigate]);

  useEffect(() => {
    if (session && userRole === "admin") {
      fetchNews();
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

  const handleCategoryChange = async (newsId: string, category: string) => {
    const { error } = await supabase
      .from("news")
      .update({ category: category as any })
      .eq("id", newsId);

    if (error) {
      toast.error("Không thể cập nhật danh mục");
      console.error(error);
    } else {
      toast.success("Đã cập nhật danh mục");
      fetchNews();
    }
  };

  if (isLoading || userRole !== "admin") {
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
      <main className="container py-8">
        <h1 className="text-3xl font-bold mb-6">Duyệt tin - Phân loại tin tức</h1>

        {news.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            Không có tin tức nào cần phân loại
          </Card>
        ) : (
          <div className="space-y-4">
            {news.map((item) => (
              <Card key={item.id} className="p-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="font-semibold mb-2">{item.title}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {item.description}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {new Date(item.created_at).toLocaleString("vi-VN")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      defaultValue={item.category}
                      onValueChange={(value) => handleCategoryChange(item.id, value)}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Chọn danh mục" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(categoryLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Classification;
