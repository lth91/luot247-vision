import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
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
          const role = data?.role || null;
          setUserRole(role);
        });
    }
  }, [session, navigate]);
  useEffect(() => {
    // Fetch data for public access - no login required
    fetchNews();
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
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, []);
  const fetchNews = async () => {
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
    try {
      // Get base stats first
      const { data: baseStats, error: baseError } = await supabase
        .from('view_stats_base')
        .select('stat_key, stat_value');

      if (baseError) {
        console.error('Error fetching base stats:', baseError);
        return;
      }

      // Get view logs for the current week
      const now = new Date();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay() + 1); // Monday
      startOfWeek.setHours(0, 0, 0, 0);
      
      const { data: logsData, error: logsError } = await supabase
        .from('view_logs')
        .select('viewed_at')
        .gte('viewed_at', startOfWeek.toISOString())
        .order('viewed_at', { ascending: true });

      if (logsError) {
        console.error('Error fetching weekly logs:', logsError);
        return;
      }

      // Calculate base daily average
      const baseToday = baseStats?.find(s => s.stat_key === 'base_today')?.stat_value || 0;
      const baseWeek = baseStats?.find(s => s.stat_key === 'base_week')?.stat_value || 0;
      const baseDaily = Math.floor(baseWeek / 7); // Average daily base views

      // Group logs by day
      const dailyLogCounts: { [key: string]: number } = {};
      const weekDays = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
      
      // Initialize all days with base daily average
      weekDays.forEach(day => {
        dailyLogCounts[day] = baseDaily;
      });

      // Add logs to each day
      logsData?.forEach(log => {
        const date = new Date(log.viewed_at);
        const dayOfWeek = date.getDay();
        const dayName = weekDays[dayOfWeek === 0 ? 6 : dayOfWeek - 1];
        dailyLogCounts[dayName]++;
      });

      // Special handling for today - use actual today value
      const todayName = weekDays[now.getDay() === 0 ? 6 : now.getDay() - 1];
      dailyLogCounts[todayName] = stats.today; // Use the actual today value from stats

      // Convert to chart data format
      const currentDayOfWeek = now.getDay();
      const daysFromMonday = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1;
      
      const chartData = weekDays.slice(0, daysFromMonday + 1).map(day => ({
        name: day,
        views: dailyLogCounts[day] || 0
      }));
      
      setWeeklyData(chartData);
    } catch (error) {
      console.error('Error in fetchWeeklyData:', error);
    }
  };
  const fetchMonthlyData = async () => {
    try {
      // Get base stats first
      const { data: baseStats, error: baseError } = await supabase
        .from('view_stats_base')
        .select('stat_key, stat_value');

      if (baseError) {
        console.error('Error fetching base stats:', baseError);
        return;
      }

      // Get view logs for the current month
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      startOfMonth.setHours(0, 0, 0, 0);
      
      const { data: logsData, error: logsError } = await supabase
        .from('view_logs')
        .select('viewed_at')
        .gte('viewed_at', startOfMonth.toISOString())
        .order('viewed_at', { ascending: true });

      if (logsError) {
        console.error('Error fetching monthly logs:', logsError);
        return;
      }

      // Get base stats and current day info
      const baseMonth = baseStats?.find(s => s.stat_key === 'base_month')?.stat_value || 0;
      const currentDay = now.getDate();
      const totalDaysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      
      // Count actual view logs per day (these are the real views from view_logs)
      const dailyLogCounts: { [key: number]: number } = {};
      
      logsData?.forEach(log => {
        const date = new Date(log.viewed_at);
        const day = date.getDate();
        if (day <= currentDay) {
          dailyLogCounts[day] = (dailyLogCounts[day] || 0) + 1;
        }
      });

      // Get total monthly views from stats
      const totalMonthViews = stats.thisMonth; // This includes base + logs
      const todayViews = stats.today; // Actual views for today
      
      // Start by setting today's views accurately
      const dailyViews: { [key: number]: number } = {};
      dailyViews[currentDay] = todayViews;
      
      // Calculate remaining views to distribute across other days (1 to currentDay-1)
      const remainingViews = totalMonthViews - todayViews;
      const daysToFill = currentDay - 1; // All days except today
      
      // Calculate average for remaining days
      const averageDaily = daysToFill > 0 ? Math.floor(remainingViews / daysToFill) : 0;
      
      // Generate random variation for days 1 to (currentDay - 1)
      let totalAssignedViews = 0;
      for (let i = 1; i < currentDay; i++) {
        // Random multiplier between 0.7 and 1.3 (30% variation)
        const randomMultiplier = 0.7 + Math.random() * 0.6;
        const dailyView = Math.round(averageDaily * randomMultiplier);
        dailyViews[i] = dailyView;
        totalAssignedViews += dailyView;
      }
      
      // Normalize to match exact remaining total
      const scaleFactor = totalAssignedViews > 0 ? remainingViews / totalAssignedViews : 1;
      for (let i = 1; i < currentDay; i++) {
        dailyViews[i] = Math.round(dailyViews[i] * scaleFactor);
      }
      
      // Final adjustment: ensure exact total
      let finalTotal = Object.values(dailyViews).reduce((sum, val) => sum + val, 0);
      const difference = totalMonthViews - finalTotal;
      
      // Adjust the difference on the day before today to maintain accuracy
      if (currentDay > 1 && difference !== 0) {
        dailyViews[currentDay - 1] += difference;
      }

      // Convert to daily chart data format (not cumulative)
      const chartData = Array.from({ length: currentDay }, (_, i) => ({
        name: `${i + 1}`,
        views: dailyViews[i + 1] || 0
      }));
      
      setMonthlyData(chartData);
    } catch (error) {
      console.error('Error in fetchMonthlyData:', error);
    }
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