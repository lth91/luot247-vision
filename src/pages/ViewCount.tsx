import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Session } from "@supabase/supabase-js";
import { Eye, TrendingUp } from "lucide-react";

const categoryLabels = {
  "chinh-tri": "Chính trị",
  "kinh-te": "Kinh tế",
  "xa-hoi": "Xã hội",
  "the-thao": "Thể thao",
  "giai-tri": "Giải trí",
  "cong-nghe": "Công nghệ",
  "khac": "Khác",
};

const ViewCount = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [news, setNews] = useState<any[]>([]);
  const [stats, setStats] = useState({ total: 0, totalViews: 0 });
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
    fetchNews();
  }, []);

  const fetchNews = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("news")
      .select("*")
      .order("view_count", { ascending: false });

    if (error) {
      toast.error("Không thể tải dữ liệu");
      console.error(error);
    } else {
      setNews(data || []);
      const totalViews = (data || []).reduce((sum, item) => sum + (item.view_count || 0), 0);
      setStats({
        total: (data || []).length,
        totalViews,
      });
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header user={session?.user} userRole={userRole} />
      <main className="container py-8">
        <h1 className="text-3xl font-bold mb-6">Thống kê lượt xem</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Card className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-lg">
                <Eye className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tổng lượt xem</p>
                <p className="text-2xl font-bold">
                  {stats.totalViews.toLocaleString("vi-VN")}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-secondary/10 rounded-lg">
                <TrendingUp className="h-6 w-6 text-secondary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tổng số tin</p>
                <p className="text-2xl font-bold">
                  {stats.total.toLocaleString("vi-VN")}
                </p>
              </div>
            </div>
          </Card>
        </div>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">#</TableHead>
                <TableHead>Tiêu đề</TableHead>
                <TableHead>Danh mục</TableHead>
                <TableHead className="text-right">Lượt xem</TableHead>
                <TableHead>Ngày tạo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center">
                    Đang tải...
                  </TableCell>
                </TableRow>
              ) : news.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Không có dữ liệu
                  </TableCell>
                </TableRow>
              ) : (
                news.map((item, index) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{index + 1}</TableCell>
                    <TableCell className="font-medium">{item.title}</TableCell>
                    <TableCell>
                      {categoryLabels[item.category] || item.category}
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {(item.view_count || 0).toLocaleString("vi-VN")}
                    </TableCell>
                    <TableCell>
                      {new Date(item.created_at).toLocaleDateString("vi-VN")}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </main>
    </div>
  );
};

export default ViewCount;
