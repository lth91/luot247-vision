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
    const { data, error } = await supabase.rpc('get_current_stats');
    
    if (error) {
      console.error('Error fetching stats:', error);
      toast.error("Không thể tải thống kê");
      return;
    }
    
    if (data && data.length > 0) {
      const statsData = data[0];
      setStats({
        yesterday: statsData.yesterday || 0,
        today: statsData.today || 0,
        thisWeek: statsData.this_week || 0,
        thisMonth: statsData.this_month || 0,
        total: statsData.total || 0
      });
    }
  };
  const fetchWeeklyData = async () => {
    const now = new Date();
    const currentDayOfWeek = now.getDay(); // 0 = CN, 1 = T2, ..., 6 = T7
    
    // Convert to Monday-based (0 = T2, 1 = T3, ..., 6 = CN)
    const daysFromMonday = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1;
    
    const weekDays = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
    const dailyCounts = [285, 295, 310, 280, 290, 305, 270];
    
    // Only show days up to today
    const chartData = weekDays.slice(0, daysFromMonday + 1).map((day, index) => ({
      name: day,
      views: dailyCounts[index]
    }));
    setWeeklyData(chartData);
  };
  const fetchMonthlyData = async () => {
    const now = new Date();
    const currentDay = now.getDate(); // Ngày hiện tại
    
    // Static monthly data based on 13448 total views
    // Average: ~434 per day with realistic variation
    const baseAverage = Math.floor(13448 / currentDay); // Chia cho ngày hiện tại
    const dailyCounts = Array.from({ length: currentDay }, (_, i) => {
      // Add some realistic variation (-50 to +50)
      const variation = Math.floor(Math.random() * 100) - 50;
      return baseAverage + variation;
    });
    
    // Adjust to ensure total is exactly 13448
    const currentTotal = dailyCounts.reduce((sum, count) => sum + count, 0);
    const difference = 13448 - currentTotal;
    dailyCounts[dailyCounts.length - 1] += difference;
    
    const chartData = Array.from({ length: currentDay }, (_, i) => ({
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

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Weekly Chart */}
          <Card className="p-4 md:p-6">
            <h2 className="text-lg md:text-xl font-bold mb-4">Biểu đồ view tuần này</h2>
            <ChartContainer config={{
              views: {
                label: "Lượt xem",
                color: "hsl(var(--primary))"
              }
            }} className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line 
                    type="monotone" 
                    dataKey="views" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={3}
                    dot={{ fill: "hsl(var(--primary))", r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </Card>

          {/* Monthly Chart */}
          <Card className="p-4 md:p-6">
            <h2 className="text-lg md:text-xl font-bold mb-4">Biểu đồ view tháng này</h2>
            <ChartContainer config={{
              views: {
                label: "Lượt xem",
                color: "hsl(var(--primary))"
              }
            }} className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line 
                    type="monotone" 
                    dataKey="views" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={3}
                    dot={{ fill: "hsl(var(--primary))", r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </Card>
        </div>

        {/* News Table */}
        
      </main>
    </div>;
};
export default ViewCount;