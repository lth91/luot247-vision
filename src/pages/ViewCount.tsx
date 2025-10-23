import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Session } from "@supabase/supabase-js";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

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
  const [stats, setStats] = useState({ 
    yesterday: 0, 
    today: 0, 
    thisWeek: 0, 
    thisMonth: 0, 
    total: 0 
  });
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
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
    fetchStats();
    fetchWeeklyData();
    fetchMonthlyData();
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
    }
    setIsLoading(false);
  };

  const fetchStats = async () => {
    const now = new Date();
    
    // Hôm nay 7h sáng
    const today7AM = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    
    // Hôm qua 7h sáng
    const yesterday7AM = new Date(today7AM);
    yesterday7AM.setDate(yesterday7AM.getDate() - 1);
    
    // Thứ 2 tuần này 7h sáng
    const dayOfWeek = now.getDay();
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const thisMonday7AM = new Date(today7AM);
    thisMonday7AM.setDate(thisMonday7AM.getDate() - daysFromMonday);
    
    // Ngày 1 tháng này 7h sáng
    const firstOfMonth7AM = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);

    const [yesterdayRes, todayRes, weekRes, monthRes, totalRes] = await Promise.all([
      // Hôm qua
      supabase
        .from("view_logs")
        .select("id", { count: "exact", head: true })
        .gte("viewed_at", yesterday7AM.toISOString())
        .lt("viewed_at", today7AM.toISOString()),
      
      // Hôm nay
      supabase
        .from("view_logs")
        .select("id", { count: "exact", head: true })
        .gte("viewed_at", today7AM.toISOString()),
      
      // Tuần này
      supabase
        .from("view_logs")
        .select("id", { count: "exact", head: true })
        .gte("viewed_at", thisMonday7AM.toISOString()),
      
      // Tháng này
      supabase
        .from("view_logs")
        .select("id", { count: "exact", head: true })
        .gte("viewed_at", firstOfMonth7AM.toISOString()),
      
      // Cộng dồn
      supabase
        .from("view_logs")
        .select("id", { count: "exact", head: true })
    ]);

    setStats({
      yesterday: yesterdayRes.count || 0,
      today: todayRes.count || 0,
      thisWeek: weekRes.count || 0,
      thisMonth: monthRes.count || 0,
      total: totalRes.count || 0,
    });
  };

  const fetchWeeklyData = async () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const thisMonday7AM = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    thisMonday7AM.setDate(thisMonday7AM.getDate() - daysFromMonday);

    const { data, error } = await supabase
      .from("view_logs")
      .select("viewed_at")
      .gte("viewed_at", thisMonday7AM.toISOString());

    if (error) {
      console.error(error);
      return;
    }

    // Group by day
    const weekDays = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
    const dailyCounts = new Array(7).fill(0);

    data?.forEach(log => {
      const logDate = new Date(log.viewed_at);
      const daysSinceMonday = Math.floor((logDate.getTime() - thisMonday7AM.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceMonday >= 0 && daysSinceMonday < 7) {
        dailyCounts[daysSinceMonday]++;
      }
    });

    const chartData = weekDays.map((day, index) => ({
      name: day,
      views: dailyCounts[index],
    }));

    setWeeklyData(chartData);
  };

  const fetchMonthlyData = async () => {
    const now = new Date();
    const firstOfMonth7AM = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    const { data, error } = await supabase
      .from("view_logs")
      .select("viewed_at")
      .gte("viewed_at", firstOfMonth7AM.toISOString());

    if (error) {
      console.error(error);
      return;
    }

    // Group by day
    const dailyCounts = new Array(daysInMonth).fill(0);

    data?.forEach(log => {
      const logDate = new Date(log.viewed_at);
      const dayOfMonth = logDate.getDate() - 1; // 0-indexed
      if (dayOfMonth >= 0 && dayOfMonth < daysInMonth) {
        dailyCounts[dayOfMonth]++;
      }
    });

    const chartData = Array.from({ length: daysInMonth }, (_, i) => ({
      name: `${i + 1}`,
      views: dailyCounts[i],
    }));

    setMonthlyData(chartData);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header user={session?.user} userRole={userRole} />
      <main className="container py-8 space-y-8">
        <h1 className="text-3xl font-bold">Thống kê lượt xem</h1>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="p-4 text-center">
            <p className="text-sm text-muted-foreground mb-1">Hôm qua</p>
            <p className="text-3xl font-bold text-blue-600">
              {stats.yesterday.toLocaleString("vi-VN")}
            </p>
          </Card>
          
          <Card className="p-4 text-center">
            <p className="text-sm text-muted-foreground mb-1">Hôm nay</p>
            <p className="text-3xl font-bold text-blue-600">
              {stats.today.toLocaleString("vi-VN")}
            </p>
          </Card>
          
          <Card className="p-4 text-center">
            <p className="text-sm text-muted-foreground mb-1">Tuần này</p>
            <p className="text-3xl font-bold text-green-600">
              {stats.thisWeek.toLocaleString("vi-VN")}
            </p>
          </Card>
          
          <Card className="p-4 text-center">
            <p className="text-sm text-muted-foreground mb-1">Tháng này</p>
            <p className="text-3xl font-bold text-orange-600">
              {stats.thisMonth.toLocaleString("vi-VN")}
            </p>
          </Card>
          
          <Card className="p-4 text-center">
            <p className="text-sm text-muted-foreground mb-1">Cộng dồn</p>
            <p className="text-3xl font-bold text-purple-600">
              {stats.total.toLocaleString("vi-VN")}
            </p>
          </Card>
        </div>

        {/* Weekly Chart */}
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">Biểu đồ view tuần này</h2>
          <ChartContainer
            config={{
              views: {
                label: "Lượt xem",
                color: "hsl(var(--primary))",
              },
            }}
            className="h-[300px]"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="views" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        </Card>

        {/* Monthly Chart */}
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">Biểu đồ view tháng này</h2>
          <ChartContainer
            config={{
              views: {
                label: "Lượt xem",
                color: "hsl(var(--primary))",
              },
            }}
            className="h-[300px]"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="views" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        </Card>

        {/* News Table */}
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
