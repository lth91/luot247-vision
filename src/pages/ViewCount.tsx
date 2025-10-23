import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Session } from "@supabase/supabase-js";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
const categoryLabels = {
  "chinh-tri": "Chính trị",
  "kinh-te": "Kinh tế",
  "xa-hoi": "Xã hội",
  "the-thao": "Thể thao",
  "giai-tri": "Giải trí",
  "cong-nghe": "Công nghệ",
  "khac": "Khác"
};
const ViewCount = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [news, setNews] = useState<any[]>([]);
  const [stats, setStats] = useState({
    today: 0,
    thisWeek: 0,
    thisMonth: 0,
    total: 0
  });
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    const {
      data: {
        subscription
      }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    supabase.auth.getSession().then(({
      data: {
        session
      }
    }) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (session?.user) {
      supabase.from("user_roles").select("role").eq("user_id", session.user.id).maybeSingle().then(({
        data
      }) => {
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
    const {
      data,
      error
    } = await supabase.from("news").select("*").order("view_count", {
      ascending: false
    });
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

    // Thứ 2 tuần này 7h sáng
    const dayOfWeek = now.getDay();
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const thisMonday7AM = new Date(today7AM);
    thisMonday7AM.setDate(thisMonday7AM.getDate() - daysFromMonday);

    // Ngày 1 tháng này 7h sáng
    const firstOfMonth7AM = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    
    const [todayRes, weekRes, monthRes, totalRes] = await Promise.all([
      // Hôm nay
      supabase.from("view_logs").select("id", {
        count: "exact",
        head: true
      }).gte("viewed_at", today7AM.toISOString()),
      // Tuần này
      supabase.from("view_logs").select("id", {
        count: "exact",
        head: true
      }).gte("viewed_at", thisMonday7AM.toISOString()),
      // Tháng này
      supabase.from("view_logs").select("id", {
        count: "exact",
        head: true
      }).gte("viewed_at", firstOfMonth7AM.toISOString()),
      // Cộng dồn
      supabase.from("view_logs").select("id", {
        count: "exact",
        head: true
      })
    ]);
    
    setStats({
      today: todayRes.count || 0,
      thisWeek: weekRes.count || 0,
      thisMonth: monthRes.count || 0,
      total: totalRes.count || 0
    });
  };
  const fetchWeeklyData = async () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const thisMonday7AM = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    thisMonday7AM.setDate(thisMonday7AM.getDate() - daysFromMonday);
    const {
      data,
      error
    } = await supabase.from("view_logs").select("viewed_at").gte("viewed_at", thisMonday7AM.toISOString());
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
      views: dailyCounts[index]
    }));
    setWeeklyData(chartData);
  };
  const fetchMonthlyData = async () => {
    const now = new Date();
    const firstOfMonth7AM = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const {
      data,
      error
    } = await supabase.from("view_logs").select("viewed_at").gte("viewed_at", firstOfMonth7AM.toISOString());
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
    const chartData = Array.from({
      length: daysInMonth
    }, (_, i) => ({
      name: `${i + 1}`,
      views: dailyCounts[i]
    }));
    setMonthlyData(chartData);
  };
  return <div className="min-h-screen bg-background">
      <Header user={session?.user} userRole={userRole} />
      <main className="container py-8 space-y-8">
        <h1 className="text-3xl font-bold">Thống kê lượt xem</h1>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-6 text-center bg-card hover:shadow-lg transition-shadow">
            <p className="text-sm text-muted-foreground mb-2">Hôm nay</p>
            <p className="text-4xl font-bold text-blue-500">
              {stats.today.toLocaleString("vi-VN")}
            </p>
          </Card>
          
          <Card className="p-6 text-center bg-card hover:shadow-lg transition-shadow">
            <p className="text-sm text-muted-foreground mb-2">Tuần này</p>
            <p className="text-4xl font-bold text-green-500">
              {stats.thisWeek.toLocaleString("vi-VN")}
            </p>
          </Card>
          
          <Card className="p-6 text-center bg-card hover:shadow-lg transition-shadow">
            <p className="text-sm text-muted-foreground mb-2">Tháng này</p>
            <p className="text-4xl font-bold text-orange-500">
              {stats.thisMonth.toLocaleString("vi-VN")}
            </p>
          </Card>
          
          <Card className="p-6 text-center bg-card hover:shadow-lg transition-shadow">
            <p className="text-sm text-muted-foreground mb-2">Cộng dồn</p>
            <p className="text-4xl font-bold text-purple-500">
              {stats.total.toLocaleString("vi-VN")}
            </p>
          </Card>
        </div>

        {/* Weekly Chart */}
        <Card className="p-6 shadow-md">
          <h2 className="text-xl font-bold mb-6">Biểu đồ view tuần này</h2>
          <ChartContainer config={{
            views: {
              label: "Lượt xem",
              color: "hsl(217, 91%, 60%)"
            }
          }} className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis 
                  dataKey="name" 
                  stroke="#666"
                  style={{ fontSize: '14px' }}
                />
                <YAxis 
                  stroke="#666"
                  style={{ fontSize: '14px' }}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line 
                  type="monotone" 
                  dataKey="views" 
                  stroke="hsl(217, 91%, 60%)" 
                  strokeWidth={3}
                  dot={{ fill: 'hsl(217, 91%, 60%)', r: 5 }}
                  activeDot={{ r: 7 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartContainer>
        </Card>

        {/* Monthly Chart */}
        <Card className="p-6 shadow-md">
          <h2 className="text-xl font-bold mb-6">Biểu đồ view tháng này</h2>
          <ChartContainer config={{
            views: {
              label: "Lượt xem",
              color: "hsl(142, 71%, 45%)"
            }
          }} className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis 
                  dataKey="name" 
                  stroke="#666"
                  style={{ fontSize: '14px' }}
                />
                <YAxis 
                  stroke="#666"
                  style={{ fontSize: '14px' }}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line 
                  type="monotone" 
                  dataKey="views" 
                  stroke="hsl(142, 71%, 45%)" 
                  strokeWidth={3}
                  dot={{ fill: 'hsl(142, 71%, 45%)', r: 5 }}
                  activeDot={{ r: 7 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartContainer>
        </Card>

        {/* News Table */}
        
      </main>
    </div>;
};
export default ViewCount;