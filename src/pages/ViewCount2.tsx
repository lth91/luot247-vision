import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Session } from "@supabase/supabase-js";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

const ViewCount2 = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
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
    }
  }, [session, navigate]);

  useEffect(() => {
    fetchStats();
    setIsLoading(false);
  }, []);

  // Fetch chart data after stats are loaded
  useEffect(() => {
    if (stats.today > 0) {
      fetchWeeklyData();
      fetchMonthlyData();
    }
  }, [stats]);

  // Auto-refresh data every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchStats();
      fetchWeeklyData();
      fetchMonthlyData();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    // @ts-ignore
    const { data, error } = await supabase.rpc('get_view2_stats');
    
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
    try {
      const now = new Date();
      const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay(); // Convert Sunday to 7
      const daysFromMonday = dayOfWeek - 1; // Days since Monday
      
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - daysFromMonday);
      weekStart.setHours(7, 0, 0, 0); // 7 AM Vietnam time
      
      const { data: logsData } = await (supabase as any)
        // @ts-ignore
        .from('view_logs2')
        .select('viewed_at')
        .gte('viewed_at', weekStart.toISOString())
        .order('viewed_at', { ascending: true });

      const dailyCounts: { [key: string]: number } = {};
      logsData?.forEach((log: any) => {
        const date = new Date(log.viewed_at);
        const dayName = getDayName(date.getDay());
        dailyCounts[dayName] = (dailyCounts[dayName] || 0) + 1;
      });

      const weekDays = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
      const chartData = weekDays.slice(0, daysFromMonday + 1).map(day => ({
        name: day,
        views: dailyCounts[day] || 0
      }));
      
      setWeeklyData(chartData);
    } catch (error) {
      console.error('Error in fetchWeeklyData:', error);
    }
  };

  const fetchMonthlyData = async () => {
    try {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1, 7, 0, 0); // 7 AM on 1st
      
      const { data: logsData } = await (supabase as any)
        // @ts-ignore
        .from('view_logs2')
        .select('viewed_at')
        .gte('viewed_at', firstDay.toISOString())
        .order('viewed_at', { ascending: true });

      const dailyCounts: { [key: number]: number } = {};
      const currentDay = now.getDate();
      
      logsData?.forEach((log: any) => {
        const date = new Date(log.viewed_at);
        const day = date.getDate();
        if (day <= currentDay) {
          dailyCounts[day] = (dailyCounts[day] || 0) + 1;
        }
      });

      const chartData = Array.from({ length: currentDay }, (_, i) => ({
        name: `${i + 1}`,
        views: dailyCounts[i + 1] || 0
      }));
      
      setMonthlyData(chartData);
    } catch (error) {
      console.error('Error in fetchMonthlyData:', error);
    }
  };

  const getDayName = (dayIndex: number): string => {
    const days = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
    return days[dayIndex === 0 ? 6 : dayIndex - 1];
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

        {/* Charts Grid - Tạm ẩn */}
        {false && (
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
        )}
      </main>
    </div>
  );
};

export default ViewCount2;
