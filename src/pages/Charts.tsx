import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Session } from "@supabase/supabase-js";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

// Custom Tooltip Component
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
        <p className="font-semibold mb-1">{label}</p>
        <p className="text-primary font-bold text-lg">
          {payload[0].value.toLocaleString("vi-VN")}
        </p>
      </div>
    );
  }
  return null;
};

const Charts = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
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
  }, [session]);

  useEffect(() => {
    fetchWeeklyData();
    fetchMonthlyData();
    setIsLoading(false);
  }, []);

  // Auto-refresh data every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchWeeklyData();
      fetchMonthlyData();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const fetchWeeklyData = async () => {
    // @ts-ignore
    const { data, error } = await supabase.rpc('get_weekly_stats_from_daily');
    
    if (error) {
      console.error('Error fetching weekly data:', error);
      toast.error("Không thể tải dữ liệu tuần");
      return;
    }
    
    if (data) {
      setWeeklyData(data);
    }
  };

  const fetchMonthlyData = async () => {
    // @ts-ignore
    const { data, error } = await supabase.rpc('get_monthly_stats_from_daily');
    
    if (error) {
      console.error('Error fetching monthly data:', error);
      toast.error("Không thể tải dữ liệu tháng");
      return;
    }
    
    if (data) {
      setMonthlyData(data);
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

  return (
    <div className="min-h-screen bg-background">
      <Header user={session?.user} userRole={userRole} />
      <main className="container py-8 space-y-8">
        <h1 className="text-3xl font-bold">Biểu đồ thống kê</h1>

        {/* Weekly Chart */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">View tuần này</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={weeklyData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="day_name" 
                className="text-xs"
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis 
                className="text-xs"
                stroke="hsl(var(--muted-foreground))"
              />
              <Tooltip content={<CustomTooltip />} />
              <Line 
                type="monotone" 
                dataKey="view_count" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                dot={{ fill: "hsl(var(--primary))", r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Monthly Chart */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">View tháng này</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="day" 
                className="text-xs"
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis 
                className="text-xs"
                stroke="hsl(var(--muted-foreground))"
              />
              <Tooltip content={<CustomTooltip />} />
              <Line 
                type="monotone" 
                dataKey="view_count" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                dot={{ fill: "hsl(var(--primary))", r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>

      </main>
    </div>
  );
};

export default Charts;
