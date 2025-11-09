import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Session } from "@supabase/supabase-js";
import { TrendingUp, Settings } from "lucide-react";

const ViewManagement2 = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [roleChecked, setRoleChecked] = useState(false);
  
  // Current stats
  const [currentStats, setCurrentStats] = useState({
    yesterday: 0,
    today: 0,
    thisWeek: 0,
    thisMonth: 0,
    total: 0
  });
  
  // Edit values
  const [editValues, setEditValues] = useState({
    yesterday: 0,
    today: 0,
    thisWeek: 0,
    thisMonth: 0,
    total: 0
  });
  
  // Track initial values to calculate deltas
  const [initialValues, setInitialValues] = useState({
    yesterday: 0,
    today: 0,
    thisWeek: 0,
    thisMonth: 0,
    total: 0
  });
  
  // Auto-add views
  const [totalViews, setTotalViews] = useState("");
  const [durationHours, setDurationHours] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Test reset
  const [testResetLoading, setTestResetLoading] = useState(false);
  const [beforeResetStats, setBeforeResetStats] = useState<any>(null);
  const [afterResetStats, setAfterResetStats] = useState<any>(null);


  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setSessionChecked(true);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setSessionChecked(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user) {
      checkAdminRole();
    } else {
      setUserRole(null);
      setRoleChecked(true);
    }
  }, [session]);


  useEffect(() => {
    if (!sessionChecked || !roleChecked) return;
    
    const isAdminByRole = session?.user && userRole === "admin";
    const isAdminByEmail = session?.user?.email === 'longth91@gmail.com';
    const isAdmin = isAdminByRole || isAdminByEmail;
    
    if (session?.user && isAdmin) {
      fetchCurrentStats();
      setIsLoading(false);
    } else if (session?.user && !isAdmin) {
      toast.error("Bạn không có quyền truy cập trang này");
      navigate("/");
    } else if (!session) {
      navigate("/auth");
    }
  }, [session, userRole, sessionChecked, roleChecked, navigate]);

  const checkAdminRole = async () => {
    if (!session?.user) return;

    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (error) throw error;

      if (data?.role === "admin") {
        setUserRole("admin");
      } else {
        setUserRole(null);
      }
    } catch (error) {
      console.error("Error checking admin role:", error);
      setUserRole(null);
    } finally {
      setRoleChecked(true);
    }
  };

  // Handler functions for auto-updating related values
  // These handlers calculate delta from current value to new value
  const handleTodayChange = (newValue: number) => {
    const delta = newValue - editValues.today;
    setEditValues(prev => ({
      yesterday: prev.yesterday,
      today: newValue,
      thisWeek: prev.thisWeek + delta,
      thisMonth: prev.thisMonth + delta,
      total: prev.total + delta
    }));
  };

  const handleYesterdayChange = (newValue: number) => {
    const delta = newValue - editValues.yesterday;
    setEditValues(prev => ({
      yesterday: newValue,
      today: prev.today,
      thisWeek: prev.thisWeek,
      thisMonth: prev.thisMonth,
      total: prev.total + delta
    }));
  };

  const handleThisWeekChange = (newValue: number) => {
    const delta = newValue - editValues.thisWeek;
    setEditValues(prev => ({
      yesterday: prev.yesterday,
      today: prev.today,
      thisWeek: newValue,
      thisMonth: prev.thisMonth + delta,
      total: prev.total + delta
    }));
  };

  const handleThisMonthChange = (newValue: number) => {
    const delta = newValue - editValues.thisMonth;
    setEditValues(prev => ({
      yesterday: prev.yesterday,
      today: prev.today,
      thisWeek: prev.thisWeek,
      thisMonth: newValue,
      total: prev.total + delta
    }));
  };

  const handleTotalChange = (newValue: number) => {
    setEditValues(prev => ({
      ...prev,
      total: newValue
    }));
  };

  const fetchCurrentStats = async () => {
    try {
      // @ts-ignore
      const { data, error } = await supabase.rpc('get_view2_stats');
      
      if (error) {
        console.error('Error fetching stats:', error);
        return;
      }

      if (data && data.length > 0) {
        const statsData = data[0];
        setCurrentStats({
          yesterday: statsData.yesterday || 0,
          today: statsData.today || 0,
          thisWeek: statsData.this_week || 0,
          thisMonth: statsData.this_month || 0,
          total: statsData.total || 0
        });
        
        // Set edit values and initial values to current stats
        const newEditValues = {
          yesterday: statsData.yesterday || 0,
          today: statsData.today || 0,
          thisWeek: statsData.this_week || 0,
          thisMonth: statsData.this_month || 0,
          total: statsData.total || 0
        };
        setEditValues(newEditValues);
        setInitialValues(newEditValues);
      }
    } catch (error) {
      console.error('Error fetching current stats:', error);
    }
  };

  const handleDirectEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!session?.user || (userRole !== "admin" && session.user.email !== 'longth91@gmail.com')) {
      toast.error("Bạn không có quyền");
      return;
    }

    try {
      // Update each stat value one by one
      const updatesToDo = [];
      
      if (editValues.yesterday !== currentStats.yesterday) {
        updatesToDo.push({
          key: 'yesterday',
          value: editValues.yesterday,
          needsLogReset: true,
          periodType: 'yesterday'
        });
      }
      
      if (editValues.today !== currentStats.today) {
        updatesToDo.push({
          key: 'today',
          value: editValues.today,
          needsLogReset: true,
          periodType: 'today'
        });
      }
      
      if (editValues.thisWeek !== currentStats.thisWeek) {
        updatesToDo.push({
          key: 'this_week',
          value: editValues.thisWeek,
          needsLogReset: true,
          periodType: 'week'
        });
      }
      
      if (editValues.thisMonth !== currentStats.thisMonth) {
        updatesToDo.push({
          key: 'this_month',
          value: editValues.thisMonth,
          needsLogReset: true,
          periodType: 'month'
        });
      }
      
      if (editValues.total !== currentStats.total) {
        updatesToDo.push({
          key: 'total',
          value: editValues.total,
          needsLogReset: false
        });
      }

      if (updatesToDo.length > 0) {
        // Execute all updates
        for (const update of updatesToDo) {
          // Calculate the difference between desired value and current logs
          // We need to set base_value so that: base_value + logs = desired_value
          // Therefore: base_value = desired_value - logs
          let newBaseValue = update.value;
          
          // If this stat needs log reset, we need to calculate the correct base value
          if (update.needsLogReset && update.periodType) {
            // Get current logs count for this period
            const now = new Date();
            let startTime: string;
            let endTime: string | null = null;
            
            if (update.periodType === 'yesterday') {
              // Calculate yesterday 7 AM GMT+7
              // Get current time in GMT+7
              const vnNow = new Date(now.getTime() + (7 * 60 * 60 * 1000));
              const vnYesterday = new Date(vnNow);
              vnYesterday.setDate(vnNow.getDate() - 1);
              vnYesterday.setUTCHours(0, 0, 0, 0); // 7 AM GMT+7 = 0:00 UTC same day
              
              // Calculate today 7 AM GMT+7
              const vnToday = new Date(vnNow);
              vnToday.setUTCHours(0, 0, 0, 0);
              
              // Convert back to UTC for database query
              const startOfYesterdayUTC = new Date(vnYesterday.getTime() - (7 * 60 * 60 * 1000));
              const endOfYesterdayUTC = new Date(vnToday.getTime() - (7 * 60 * 60 * 1000));
              
              startTime = startOfYesterdayUTC.toISOString();
              endTime = endOfYesterdayUTC.toISOString();
            } else if (update.periodType === 'today') {
              // Calculate today 7 AM GMT+7
              const vnNow = new Date(now.getTime() + (7 * 60 * 60 * 1000));
              const vnToday = new Date(vnNow);
              vnToday.setUTCHours(0, 0, 0, 0);
              
              // Calculate tomorrow 7 AM GMT+7
              const vnTomorrow = new Date(vnToday);
              vnTomorrow.setDate(vnTomorrow.getDate() + 1);
              
              // Convert back to UTC for database query
              const startOfTodayUTC = new Date(vnToday.getTime() - (7 * 60 * 60 * 1000));
              const endOfTodayUTC = new Date(vnTomorrow.getTime() - (7 * 60 * 60 * 1000));
              
              startTime = startOfTodayUTC.toISOString();
              endTime = endOfTodayUTC.toISOString();
            } else if (update.periodType === 'week') {
              // Calculate Monday 7 AM GMT+7 of current week
              const vnNow = new Date(now.getTime() + (7 * 60 * 60 * 1000));
              const dayOfWeek = vnNow.getDay() === 0 ? 7 : vnNow.getDay();
              const daysFromMonday = dayOfWeek - 1;
              
              const monday = new Date(vnNow);
              monday.setDate(vnNow.getDate() - daysFromMonday);
              monday.setUTCHours(0, 0, 0, 0);
              
              const startOfWeekUTC = new Date(monday.getTime() - (7 * 60 * 60 * 1000));
              startTime = startOfWeekUTC.toISOString();
            } else if (update.periodType === 'month') {
              // Calculate first day of month at 7 AM GMT+7
              const vnNow = new Date(now.getTime() + (7 * 60 * 60 * 1000));
              const firstDay = new Date(vnNow.getFullYear(), vnNow.getMonth(), 1, 7, 0, 0);
              const firstDayUTC = new Date(firstDay.getTime() - (7 * 60 * 60 * 1000));
              startTime = firstDayUTC.toISOString();
            } else {
              startTime = '1970-01-01T00:00:00Z';
            }
            
            // For "yesterday", get_view2_stats() only returns base_value (no logs added)
            // So we need to delete all logs in this period and set base_value to desired value
            if (update.periodType === 'yesterday') {
              // Delete all logs in yesterday period
              if (endTime) {
                const { error: deleteError } = await (supabase as any)
                  .from('view_logs2')
                  .delete()
                  .gte('viewed_at', startTime)
                  .lt('viewed_at', endTime);
                if (deleteError) {
                  console.error('Error deleting yesterday logs:', deleteError);
                }
              }
              // Set base_value directly to desired value (no need to subtract logs)
              newBaseValue = update.value;
            } else {
              // For other periods (today, week, month), calculate base = desired - logs
              let logCount = 0;
              if (endTime) {
                const { count } = await (supabase as any)
                  .from('view_logs2')
                  .select('*', { count: 'exact', head: true })
                  .gte('viewed_at', startTime)
                  .lt('viewed_at', endTime);
                logCount = count || 0;
              } else {
                const { count } = await (supabase as any)
                  .from('view_logs2')
                  .select('*', { count: 'exact', head: true })
                  .gte('viewed_at', startTime);
                logCount = count || 0;
              }
              
              // Calculate base value: base = desired - logs
              newBaseValue = update.value - logCount;
              
              // If setting to 0 or less, also delete the logs to fully reset
              if (update.value <= 0 && logCount > 0) {
                console.log(`Deleting logs from ${startTime} to ${endTime || 'now'}`);
                if (endTime) {
                  await (supabase as any)
                    .from('view_logs2')
                    .delete()
                    .gte('viewed_at', startTime)
                    .lt('viewed_at', endTime);
                } else {
                  await (supabase as any)
                    .from('view_logs2')
                    .delete()
                    .gte('viewed_at', startTime);
                }
                // Reset base to 0 since we deleted the logs
                newBaseValue = update.value;
              }
            }
          }
          
          // Update base value (records should already exist from migration)
          const { error } = await (supabase as any)
            .from('view_stats2')
            .update({ 
              stat_value: newBaseValue, 
              updated_at: new Date().toISOString() 
            })
            .eq('stat_key', update.key);
          
          if (error) {
            console.error(`Error updating ${update.key}:`, error);
            
            // If record doesn't exist, insert it (bypassing RLS with upsert)
            if (error.code === 'PGRST116' || error.message?.includes('No rows')) {
              console.log(`Record not found for ${update.key}, attempting insert...`);
              const { error: insertError } = await (supabase as any)
                .from('view_stats2')
                .insert({ 
                  stat_key: update.key,
                  stat_value: newBaseValue, 
                  updated_at: new Date().toISOString() 
                });
              
              if (insertError) {
                console.error(`Error inserting ${update.key}:`, insertError);
                throw insertError;
              }
            } else {
              throw error;
            }
          }
        }
        
        toast.success("Đã cập nhật số view thành công!");
        await fetchCurrentStats();
        
        // Reset form with new values
        setEditValues({
          yesterday: editValues.yesterday,
          today: editValues.today,
          thisWeek: editValues.thisWeek,
          thisMonth: editValues.thisMonth,
          total: editValues.total
        });
      }
    } catch (error: any) {
      console.error('Error updating stats:', error);
      toast.error(`Lỗi: ${error.message}`);
    }
  };


  const handleAddViews = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!session?.user || (userRole !== "admin" && session.user.email !== 'longth91@gmail.com')) {
      toast.error("Bạn không có quyền");
      return;
    }

    const total = parseInt(totalViews);
    const duration = parseFloat(durationHours);

    if (!total || total <= 0 || !duration || duration <= 0) {
      toast.error("Vui lòng nhập số lượng view và thời gian hợp lệ");
      return;
    }

    setIsProcessing(true);

    try {
      // Call edge function to add views in background
      const { data, error } = await supabase.functions.invoke('add-views2-background', {
        body: { totalViews: total, durationHours: duration }
      });

      if (error) {
        console.error('Error calling Edge Function:', error);
        toast.error("Có lỗi xảy ra khi thêm view: " + error.message);
        setIsProcessing(false);
        return;
      }

      if (data?.success) {
        toast.success(`✅ Đã bắt đầu thêm ${total} view trong ${duration} giờ! Process chạy ngầm, bạn có thể đóng browser.`);
      } else {
        toast.error("Có lỗi xảy ra khi thêm view");
      }
      
      // Reset form
      setTotalViews("");
      setDurationHours("");
      
    } catch (error: any) {
      console.error('Error calling Edge Function:', error);
      toast.error("Có lỗi xảy ra khi thêm view");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTestReset = async () => {
    if (!session?.user || (userRole !== "admin" && session.user.email !== 'longth91@gmail.com')) {
      toast.error("Bạn không có quyền");
      return;
    }

    setTestResetLoading(true);
    setBeforeResetStats(null);
    setAfterResetStats(null);

    try {
      // Get stats BEFORE reset
      const { data: beforeData, error: beforeError } = await supabase.rpc('get_view2_stats');
      if (beforeError) throw beforeError;
      
      // Get raw stat_value from view_stats2
      const { data: rawStats, error: rawError } = await supabase
        .from('view_stats2')
        .select('stat_key, stat_value')
        .in('stat_key', ['yesterday', 'today']);
      if (rawError) throw rawError;
      
      const beforeRaw = {
        yesterday: rawStats?.find(s => s.stat_key === 'yesterday')?.stat_value || 0,
        today: rawStats?.find(s => s.stat_key === 'today')?.stat_value || 0,
      };
      
      setBeforeResetStats({
        calculated: beforeData?.[0] || {},
        raw: beforeRaw
      });

      // Call reset function
      const { error: resetError } = await supabase.rpc('reset_daily_view_stats2');
      if (resetError) throw resetError;

      toast.success("✅ Đã chạy reset function!");

      // Wait a bit for the database to update
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Get stats AFTER reset
      const { data: afterData, error: afterError } = await supabase.rpc('get_view2_stats');
      if (afterError) throw afterError;
      
      // Get raw stat_value from view_stats2 after reset
      const { data: rawStatsAfter, error: rawErrorAfter } = await supabase
        .from('view_stats2')
        .select('stat_key, stat_value')
        .in('stat_key', ['yesterday', 'today']);
      if (rawErrorAfter) throw rawErrorAfter;
      
      const afterRaw = {
        yesterday: rawStatsAfter?.find(s => s.stat_key === 'yesterday')?.stat_value || 0,
        today: rawStatsAfter?.find(s => s.stat_key === 'today')?.stat_value || 0,
      };
      
      setAfterResetStats({
        calculated: afterData?.[0] || {},
        raw: afterRaw
      });

      // Refresh current stats
      await fetchCurrentStats();

    } catch (error: any) {
      console.error('Error testing reset:', error);
      toast.error(`Lỗi: ${error.message}`);
    } finally {
      setTestResetLoading(false);
    }
  };

  if (isLoading || (userRole !== "admin" && session?.user?.email !== 'longth91@gmail.com')) {
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
        <div className="flex items-center gap-3">
          <TrendingUp className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">Quản lý View (Version 2)</h1>
        </div>

        {/* Current Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Thống kê hiện tại
            </CardTitle>
            <CardDescription>
              Số view hiện tại của hệ thống
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-muted-foreground">Hôm qua</p>
                <p className="text-2xl font-bold text-blue-600">
                  {currentStats.yesterday.toLocaleString("vi-VN")}
                </p>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-muted-foreground">Hôm nay</p>
                <p className="text-2xl font-bold text-blue-600">
                  {currentStats.today.toLocaleString("vi-VN")}
                </p>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <p className="text-sm text-muted-foreground">Tuần này</p>
                <p className="text-2xl font-bold text-green-600">
                  {currentStats.thisWeek.toLocaleString("vi-VN")}
                </p>
              </div>
              <div className="text-center p-4 bg-orange-50 rounded-lg">
                <p className="text-sm text-muted-foreground">Tháng này</p>
                <p className="text-2xl font-bold text-orange-600">
                  {currentStats.thisMonth.toLocaleString("vi-VN")}
                </p>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <p className="text-sm text-muted-foreground">Cộng dồn</p>
                <p className="text-2xl font-bold text-purple-600">
                  {currentStats.total.toLocaleString("vi-VN")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>


        {/* Tabs */}
        <Tabs defaultValue="edit" className="space-y-4">
          <TabsList>
            <TabsTrigger value="edit">Sửa View Thủ Công</TabsTrigger>
            <TabsTrigger value="auto">Thêm View Tự Động</TabsTrigger>
            <TabsTrigger value="test">Test Reset Function</TabsTrigger>
          </TabsList>

          {/* Tab 1: Direct Edit */}
          <TabsContent value="edit">
            <Card>
              <CardHeader>
                <CardTitle>Sửa View Thủ Công</CardTitle>
                <CardDescription>
                  Chỉnh sửa số view của từng hạng mục thống kê
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleDirectEdit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="yesterday">Hôm qua</Label>
                      <Input
                        id="yesterday"
                        type="number"
                        value={editValues.yesterday}
                        onChange={(e) => handleYesterdayChange(parseInt(e.target.value) || 0)}
                      />
                      <p className="text-xs text-muted-foreground">
                        💡 Thay đổi này sẽ cập nhật "Cộng dồn"
                      </p>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="today">Hôm nay</Label>
                      <Input
                        id="today"
                        type="number"
                        value={editValues.today}
                        onChange={(e) => handleTodayChange(parseInt(e.target.value) || 0)}
                      />
                      <p className="text-xs text-muted-foreground">
                        💡 Thay đổi này sẽ cập nhật "Tuần này", "Tháng này", và "Cộng dồn"
                      </p>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="week">Tuần này</Label>
                      <Input
                        id="week"
                        type="number"
                        value={editValues.thisWeek}
                        onChange={(e) => handleThisWeekChange(parseInt(e.target.value) || 0)}
                      />
                      <p className="text-xs text-muted-foreground">
                        💡 Thay đổi này sẽ cập nhật "Tháng này" và "Cộng dồn"
                      </p>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="month">Tháng này</Label>
                      <Input
                        id="month"
                        type="number"
                        value={editValues.thisMonth}
                        onChange={(e) => handleThisMonthChange(parseInt(e.target.value) || 0)}
                      />
                      <p className="text-xs text-muted-foreground">
                        💡 Thay đổi này sẽ cập nhật "Cộng dồn"
                      </p>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="total">Cộng dồn</Label>
                      <Input
                        id="total"
                        type="number"
                        value={editValues.total}
                        onChange={(e) => handleTotalChange(parseInt(e.target.value) || 0)}
                      />
                      <p className="text-xs text-muted-foreground">
                        💡 Chỉ cập nhật giá trị này
                      </p>
                    </div>
                  </div>
                  
                  <Button type="submit" className="w-full">
                    Lưu Thay Đổi
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 2: Auto Add Views */}
          <TabsContent value="auto">
            <Card>
              <CardHeader>
                <CardTitle>Thêm View Tự Động</CardTitle>
                <CardDescription>
                  Thêm view tự động theo thời gian (sử dụng Edge Function)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAddViews} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="totalViews">Tổng số view cần thêm</Label>
                    <Input
                      id="totalViews"
                      type="number"
                      placeholder="Nhập số view"
                      value={totalViews}
                      onChange={(e) => setTotalViews(e.target.value)}
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="durationHours">Thời gian (giờ)</Label>
                    <Input
                      id="durationHours"
                      type="number"
                      step="0.5"
                      placeholder="1.5"
                      value={durationHours}
                      onChange={(e) => setDurationHours(e.target.value)}
                      required
                    />
                  </div>
                  
                  <Button type="submit" disabled={isProcessing} className="w-full">
                    {isProcessing ? "Đang xử lý..." : "Bắt Đầu Thêm View"}
                  </Button>
                  
                  <p className="text-sm text-muted-foreground">
                    ✅ Edge function đã được deploy! Process sẽ chạy ngầm, bạn có thể đóng browser. 
                    Views sẽ được thêm tự động theo thời gian đã cài đặt trên server.
                  </p>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 3: Test Reset */}
          <TabsContent value="test">
            <Card>
              <CardHeader>
                <CardTitle>Test Reset Function</CardTitle>
                <CardDescription>
                  Kiểm tra xem function reset có hoạt động đúng không (chuyển "today" → "yesterday")
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <Button 
                    onClick={handleTestReset} 
                    disabled={testResetLoading}
                    className="w-full"
                  >
                    {testResetLoading ? "Đang test..." : "🧪 Chạy Test Reset"}
                  </Button>
                  
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-800 font-semibold mb-2">⚠️ Lưu ý:</p>
                    <ul className="text-sm text-yellow-700 space-y-1 list-disc list-inside">
                      <li>Test này sẽ THỰC SỰ chạy function reset</li>
                      <li>Giá trị "Hôm nay" hiện tại sẽ được chuyển thành "Hôm qua"</li>
                      <li>"Hôm nay" sẽ reset về 0</li>
                      <li>Bạn có thể xem kết quả trước/sau để chắc chắn</li>
                    </ul>
                  </div>
                </div>

                {beforeResetStats && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-lg">📊 TRƯỚC KHI RESET:</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">Yesterday (Calculated)</p>
                        <p className="text-xl font-bold text-blue-700">
                          {beforeResetStats.calculated.yesterday?.toLocaleString("vi-VN")}
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">Raw stat_value:</p>
                        <p className="text-sm font-semibold text-blue-600">
                          {beforeResetStats.raw.yesterday?.toLocaleString("vi-VN")}
                        </p>
                      </div>
                      <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">Today (Calculated)</p>
                        <p className="text-xl font-bold text-green-700">
                          {beforeResetStats.calculated.today?.toLocaleString("vi-VN")}
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">Raw stat_value:</p>
                        <p className="text-sm font-semibold text-green-600">
                          {beforeResetStats.raw.today?.toLocaleString("vi-VN")}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {afterResetStats && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-lg">✅ SAU KHI RESET:</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-blue-100 border-2 border-blue-400 rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">Yesterday (Calculated)</p>
                        <p className="text-xl font-bold text-blue-800">
                          {afterResetStats.calculated.yesterday?.toLocaleString("vi-VN")}
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">Raw stat_value:</p>
                        <p className="text-sm font-semibold text-blue-700">
                          {afterResetStats.raw.yesterday?.toLocaleString("vi-VN")}
                        </p>
                      </div>
                      <div className="p-4 bg-green-100 border-2 border-green-400 rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">Today (Calculated)</p>
                        <p className="text-xl font-bold text-green-800">
                          {afterResetStats.calculated.today?.toLocaleString("vi-VN")}
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">Raw stat_value:</p>
                        <p className="text-sm font-semibold text-green-700">
                          {afterResetStats.raw.today?.toLocaleString("vi-VN")}
                        </p>
                      </div>
                    </div>
                    
                    {beforeResetStats && (
                      <div className="p-4 bg-green-50 border border-green-300 rounded-lg">
                        <p className="text-sm font-semibold text-green-800 mb-2">🎯 Kết quả:</p>
                        <ul className="text-sm text-green-700 space-y-1">
                          <li>
                            ✅ Yesterday stat_value: {beforeResetStats.raw.yesterday?.toLocaleString("vi-VN")} 
                            → <strong>{afterResetStats.raw.yesterday?.toLocaleString("vi-VN")}</strong>
                            {afterResetStats.raw.yesterday === beforeResetStats.raw.today && 
                              <span className="ml-2 text-green-600 font-bold">✓ Đúng!</span>
                            }
                          </li>
                          <li>
                            ✅ Today stat_value: {beforeResetStats.raw.today?.toLocaleString("vi-VN")} 
                            → <strong>{afterResetStats.raw.today?.toLocaleString("vi-VN")}</strong>
                            {afterResetStats.raw.today === 0 && 
                              <span className="ml-2 text-green-600 font-bold">✓ Reset về 0!</span>
                            }
                          </li>
                        </ul>
                        {afterResetStats.raw.yesterday === beforeResetStats.raw.today && 
                         afterResetStats.raw.today === 0 && (
                          <p className="mt-3 text-sm font-bold text-green-800">
                            🎉 Function hoạt động HOÀN HẢO! Ngày mai "Hôm qua" sẽ hiển thị đúng giá trị {afterResetStats.raw.yesterday?.toLocaleString("vi-VN")}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default ViewManagement2;
