import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Session } from "@supabase/supabase-js";

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

  // Auto-refresh data every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchStats();
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

      </main>
    </div>
  );
};

export default ViewCount2;
