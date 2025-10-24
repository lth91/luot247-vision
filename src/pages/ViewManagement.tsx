import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Session } from "@supabase/supabase-js";
import { Loader2, TrendingUp, Calendar, Clock, Square, Play } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ViewManagement = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [roleChecked, setRoleChecked] = useState(false);
  
  // Ref to track if process should be stopped
  const shouldStopRef = useRef(false);
  
  // Form states
  const [dailyViews, setDailyViews] = useState<string>("");
  const [weeklyViews, setWeeklyViews] = useState<string>("");
  const [monthlyViews, setMonthlyViews] = useState<string>("");
  const [timeDuration, setTimeDuration] = useState<string>("1"); // Default 1 hour
  
  // Direct edit states
  const [editMode, setEditMode] = useState<'add' | 'edit'>('add');
  const [editValues, setEditValues] = useState({
    yesterday: '',
    today: '',
    thisWeek: '',
    thisMonth: '',
    total: ''
  });
  
  // Processing state
  const [processingStats, setProcessingStats] = useState({
    totalAdded: 0,
    totalTarget: 0,
    currentBatch: 0,
    totalBatches: 0
  });
  
  // Current stats
  const [currentStats, setCurrentStats] = useState({
    yesterday: 0,
    today: 0,
    thisWeek: 0,
    thisMonth: 0,
    total: 0
  });

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
      console.log('🔍 ViewManagement - Fetching user role for:', session.user.email);
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .maybeSingle()
        .then(({ data, error }) => {
          console.log('🔍 ViewManagement - Role query result:', { data, error });
          setUserRole(data?.role || null);
          setRoleChecked(true);
        });
    } else {
      console.log('🔍 ViewManagement - No session user, setting role to null');
      setUserRole(null);
      setRoleChecked(true);
    }
  }, [session]);

  useEffect(() => {
    // Only check after both session and role have been checked
    if (!sessionChecked || !roleChecked) return;
    
    console.log('🔍 ViewManagement - Role check:', { session: !!session, userRole, sessionChecked, roleChecked });
    
    // Check if user is admin (either by role or by email)
    const isAdminByRole = session?.user && userRole === "admin";
    const isAdminByEmail = session?.user?.email === 'longth91@gmail.com';
    const isAdmin = isAdminByRole || isAdminByEmail;
    
    if (session?.user && isAdmin) {
      console.log('✅ ViewManagement - Admin access granted', { isAdminByRole, isAdminByEmail });
      fetchCurrentStats();
      setIsLoading(false);
    } else if (session?.user && !isAdmin) {
      console.log('❌ ViewManagement - Non-admin user, redirecting');
      toast.error("Bạn không có quyền truy cập trang này");
      navigate("/");
    } else if (!session) {
      console.log('❌ ViewManagement - No session, redirecting to auth');
      navigate("/auth");
    }
  }, [session, userRole, sessionChecked, roleChecked, navigate]);

  const fetchCurrentStats = async () => {
    try {
      const { data, error } = await supabase.rpc('get_current_stats');
      
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
      }
    } catch (error) {
      console.error('Error fetching current stats:', error);
    }
  };

  const generateRandomDelay = (totalViews: number, durationHours: number) => {
    // Calculate total duration in milliseconds
    const totalDurationMs = durationHours * 60 * 60 * 1000;
    
    // Calculate average delay per view
    const avgDelayPerView = totalDurationMs / totalViews;
    
    // Add some randomness: 50% to 150% of average delay
    const minDelay = avgDelayPerView * 0.5;
    const maxDelay = avgDelayPerView * 1.5;
    
    return Math.random() * (maxDelay - minDelay) + minDelay;
  };

  const addViewsWithDelay = async (viewCount: number, type: 'daily' | 'weekly' | 'monthly') => {
    const batchSize = Math.min(10, viewCount); // Process max 10 views at a time
    const batches = Math.ceil(viewCount / batchSize);
    const durationHours = parseInt(timeDuration);
    
    setProcessingStats(prev => ({
      ...prev,
      totalBatches: batches,
      currentBatch: 0
    }));
    
    for (let batch = 0; batch < batches; batch++) {
      // Check if should stop
      if (shouldStopRef.current) {
        console.log('🛑 Process stopped by user');
        break;
      }
      
      const currentBatchSize = Math.min(batchSize, viewCount - (batch * batchSize));
      
      setProcessingStats(prev => ({
        ...prev,
        currentBatch: batch + 1
      }));
      
      // Add views for this batch
      for (let i = 0; i < currentBatchSize; i++) {
        // Check if should stop
        if (shouldStopRef.current) {
          console.log('🛑 Process stopped by user');
          break;
        }
        
        try {
          // Insert a view log record
          await supabase.from("view_logs").insert({
            viewed_at: new Date().toISOString()
          });
          
          // Update processing stats
          setProcessingStats(prev => ({
            ...prev,
            totalAdded: prev.totalAdded + 1
          }));
          
          // Add small delay between individual views
          if (i < currentBatchSize - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (error) {
          console.error('Error adding view:', error);
        }
      }
      
      // Add delay between batches (only if not the last batch and not stopping)
      if (batch < batches - 1 && !shouldStopRef.current) {
        const delay = generateRandomDelay(viewCount, durationHours);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!session?.user || userRole !== "admin") {
      toast.error("Bạn không có quyền thực hiện hành động này");
      return;
    }

    const dailyCount = parseInt(dailyViews) || 0;
    const weeklyCount = parseInt(weeklyViews) || 0;
    const monthlyCount = parseInt(monthlyViews) || 0;

    if (dailyCount === 0 && weeklyCount === 0 && monthlyCount === 0) {
      toast.error("Vui lòng nhập ít nhất một giá trị view");
      return;
    }

    const totalViews = dailyCount + weeklyCount + monthlyCount;
    const durationHours = parseInt(timeDuration);

    setIsProcessing(true);
    setIsStopping(false);
    shouldStopRef.current = false;
    
    // Reset processing stats
    setProcessingStats({
      totalAdded: 0,
      totalTarget: totalViews,
      currentBatch: 0,
      totalBatches: 0
    });
    
    try {
      let totalAdded = 0;
      
      // Process daily views
      if (dailyCount > 0 && !shouldStopRef.current) {
        toast.info(`Đang thêm ${dailyCount} view trong ngày (trong ${durationHours}h)...`);
        await addViewsWithDelay(dailyCount, 'daily');
        totalAdded += dailyCount;
      }
      
      // Process weekly views
      if (weeklyCount > 0 && !shouldStopRef.current) {
        toast.info(`Đang thêm ${weeklyCount} view trong tuần (trong ${durationHours}h)...`);
        await addViewsWithDelay(weeklyCount, 'weekly');
        totalAdded += weeklyCount;
      }
      
      // Process monthly views
      if (monthlyCount > 0 && !shouldStopRef.current) {
        toast.info(`Đang thêm ${monthlyCount} view trong tháng (trong ${durationHours}h)...`);
        await addViewsWithDelay(monthlyCount, 'monthly');
        totalAdded += monthlyCount;
      }

      if (shouldStopRef.current) {
        toast.warning(`Đã dừng quá trình. Đã thêm ${processingStats.totalAdded} view`);
      } else {
        toast.success(`Đã thêm thành công ${totalAdded} view trong ${durationHours} giờ!`);
      }
      
      // Reset form
      setDailyViews("");
      setWeeklyViews("");
      setMonthlyViews("");
      
      // Refresh current stats
      await fetchCurrentStats();
      
    } catch (error) {
      console.error('Error adding views:', error);
      toast.error("Có lỗi xảy ra khi thêm view");
    } finally {
      setIsProcessing(false);
      setIsStopping(false);
    }
  };

  const handleStop = () => {
    shouldStopRef.current = true;
    setIsStopping(true);
    toast.info("Đang dừng quá trình thêm view...");
  };

  const handleDirectEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!session?.user || userRole !== "admin") {
      toast.error("Bạn không có quyền thực hiện hành động này");
      return;
    }

    const yesterdayValue = parseInt(editValues.yesterday) || 0;
    const todayValue = parseInt(editValues.today) || 0;
    const weekValue = parseInt(editValues.thisWeek) || 0;
    const monthValue = parseInt(editValues.thisMonth) || 0;
    const totalValue = parseInt(editValues.total) || 0;

    if (yesterdayValue === 0 && todayValue === 0 && weekValue === 0 && monthValue === 0 && totalValue === 0) {
      toast.error("Vui lòng nhập ít nhất một giá trị");
      return;
    }

    setIsProcessing(true);
    
    try {
      // First, get current view_logs counts to calculate the correct base values
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay() + 1);
      startOfWeek.setHours(0, 0, 0, 0);
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      startOfMonth.setHours(0, 0, 0, 0);

      // Get current view_logs counts
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      const [yesterdayLogs, todayLogs, weekLogs, monthLogs, totalLogs] = await Promise.all([
        supabase
          .from('view_logs')
          .select('id', { count: 'exact' })
          .gte('viewed_at', yesterdayStr)
          .lt('viewed_at', today),
        supabase
          .from('view_logs')
          .select('id', { count: 'exact' })
          .gte('viewed_at', today),
        supabase
          .from('view_logs')
          .select('id', { count: 'exact' })
          .gte('viewed_at', startOfWeek.toISOString()),
        supabase
          .from('view_logs')
          .select('id', { count: 'exact' })
          .gte('viewed_at', startOfMonth.toISOString()),
        supabase
          .from('view_logs')
          .select('id', { count: 'exact' })
      ]);

      const yesterdayLogCount = yesterdayLogs.count || 0;
      const todayLogCount = todayLogs.count || 0;
      const weekLogCount = weekLogs.count || 0;
      const monthLogCount = monthLogs.count || 0;
      const totalLogCount = totalLogs.count || 0;

      // Calculate new base values: target_value - current_log_count
      const updates = [];
      
      if (yesterdayValue > 0) {
        const newBaseYesterday = yesterdayValue - yesterdayLogCount;
        updates.push(
          supabase
            .from('view_stats_base')
            .update({ stat_value: Math.max(0, newBaseYesterday) })
            .eq('stat_key', 'base_yesterday')
        );
      }
      
      if (todayValue > 0) {
        const newBaseToday = todayValue - todayLogCount;
        updates.push(
          supabase
            .from('view_stats_base')
            .update({ stat_value: Math.max(0, newBaseToday) })
            .eq('stat_key', 'base_today')
        );
      }
      
      if (weekValue > 0) {
        const newBaseWeek = weekValue - weekLogCount;
        updates.push(
          supabase
            .from('view_stats_base')
            .update({ stat_value: Math.max(0, newBaseWeek) })
            .eq('stat_key', 'base_week')
        );
      }
      
      if (monthValue > 0) {
        const newBaseMonth = monthValue - monthLogCount;
        updates.push(
          supabase
            .from('view_stats_base')
            .update({ stat_value: Math.max(0, newBaseMonth) })
            .eq('stat_key', 'base_month')
        );
      }
      
      if (totalValue > 0) {
        const newBaseTotal = totalValue - totalLogCount;
        updates.push(
          supabase
            .from('view_stats_base')
            .update({ stat_value: Math.max(0, newBaseTotal) })
            .eq('stat_key', 'base_total')
        );
      }

      // Execute all updates
      const results = await Promise.all(updates);
      
      // Check for errors
      const hasError = results.some(result => result.error);
      if (hasError) {
        throw new Error('Có lỗi khi cập nhật dữ liệu');
      }

      toast.success("Đã cập nhật số view thành công!");
      
      // Reset form
      setEditValues({
        yesterday: '',
        today: '',
        thisWeek: '',
        thisMonth: '',
        total: ''
      });
      
      // Refresh current stats
      await fetchCurrentStats();
      
    } catch (error) {
      console.error('Error updating views:', error);
      toast.error("Có lỗi xảy ra khi cập nhật view");
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header user={session?.user} userRole={userRole} />
        <div className="container py-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin mx-auto" />
              <p className="text-muted-foreground">Đang tải...</p>
            </div>
          </div>
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
          <h1 className="text-3xl font-bold">Quản lý View</h1>
        </div>

        {/* Current Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Thống kê hiện tại
            </CardTitle>
            <CardDescription>
              Số view hiện tại trong hệ thống
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center p-4 bg-muted rounded-lg">
                <p className="text-2xl font-bold text-primary">{currentStats.yesterday}</p>
                <p className="text-sm text-muted-foreground">Hôm qua</p>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <p className="text-2xl font-bold text-primary">{currentStats.today}</p>
                <p className="text-sm text-muted-foreground">Hôm nay</p>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <p className="text-2xl font-bold text-primary">{currentStats.thisWeek}</p>
                <p className="text-sm text-muted-foreground">Tuần này</p>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <p className="text-2xl font-bold text-primary">{currentStats.thisMonth}</p>
                <p className="text-sm text-muted-foreground">Tháng này</p>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <p className="text-2xl font-bold text-primary">{currentStats.total}</p>
                <p className="text-sm text-muted-foreground">Tổng cộng</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Mode Toggle */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Quản lý View
            </CardTitle>
            <CardDescription>
              Chọn chế độ quản lý view
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <Button
                variant={editMode === 'add' ? 'default' : 'outline'}
                onClick={() => setEditMode('add')}
                disabled={isProcessing}
              >
                Thêm View
              </Button>
              <Button
                variant={editMode === 'edit' ? 'default' : 'outline'}
                onClick={() => setEditMode('edit')}
                disabled={isProcessing}
              >
                Chỉnh sửa trực tiếp
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Add Views Form */}
        {editMode === 'add' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Thêm View
              </CardTitle>
              <CardDescription>
                Nhập số view muốn thêm vào hệ thống. View sẽ được thêm với delay để trông giống view thật.
              </CardDescription>
            </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Daily Views */}
                <div className="space-y-2">
                  <Label htmlFor="dailyViews">View trong ngày</Label>
                  <Input
                    id="dailyViews"
                    type="number"
                    placeholder="Nhập số view"
                    value={dailyViews}
                    onChange={(e) => setDailyViews(e.target.value)}
                    min="0"
                    disabled={isProcessing}
                  />
                  <p className="text-xs text-muted-foreground">
                    Số view sẽ được thêm vào hôm nay
                  </p>
                </div>

                {/* Weekly Views */}
                <div className="space-y-2">
                  <Label htmlFor="weeklyViews">View trong tuần</Label>
                  <Input
                    id="weeklyViews"
                    type="number"
                    placeholder="Nhập số view"
                    value={weeklyViews}
                    onChange={(e) => setWeeklyViews(e.target.value)}
                    min="0"
                    disabled={isProcessing}
                  />
                  <p className="text-xs text-muted-foreground">
                    Số view sẽ được thêm vào tuần này
                  </p>
                </div>

                {/* Monthly Views */}
                <div className="space-y-2">
                  <Label htmlFor="monthlyViews">View trong tháng</Label>
                  <Input
                    id="monthlyViews"
                    type="number"
                    placeholder="Nhập số view"
                    value={monthlyViews}
                    onChange={(e) => setMonthlyViews(e.target.value)}
                    min="0"
                    disabled={isProcessing}
                  />
                  <p className="text-xs text-muted-foreground">
                    Số view sẽ được thêm vào tháng này
                  </p>
                </div>
              </div>

              {/* Time Duration Setting */}
              <div className="space-y-2">
                <Label htmlFor="timeDuration">Thời gian phân bổ</Label>
                <Select value={timeDuration} onValueChange={setTimeDuration} disabled={isProcessing}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn thời gian" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 giờ</SelectItem>
                    <SelectItem value="6">6 giờ</SelectItem>
                    <SelectItem value="12">12 giờ</SelectItem>
                    <SelectItem value="24">24 giờ</SelectItem>
                    <SelectItem value="48">48 giờ</SelectItem>
                    <SelectItem value="72">72 giờ</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  View sẽ được phân bổ đều trong khoảng thời gian này
                </p>
              </div>

              {/* Processing Stats */}
              {isProcessing && (
                <Card className="bg-blue-50 border-blue-200">
                  <CardContent className="pt-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Tiến trình:</span>
                        <span className="text-sm text-muted-foreground">
                          {processingStats.totalAdded} / {processingStats.totalTarget} view
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ 
                            width: `${processingStats.totalTarget > 0 ? (processingStats.totalAdded / processingStats.totalTarget) * 100 : 0}%` 
                          }}
                        ></div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Batch: {processingStats.currentBatch} / {processingStats.totalBatches}</span>
                        <span>Thời gian: {timeDuration}h</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="flex items-center gap-4">
                <Button 
                  type="submit" 
                  disabled={isProcessing}
                  className="flex items-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Đang xử lý...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      Thêm View
                    </>
                  )}
                </Button>

                {isProcessing && (
                  <Button 
                    type="button" 
                    variant="destructive"
                    onClick={handleStop}
                    disabled={isStopping}
                    className="flex items-center gap-2"
                  >
                    {isStopping ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Đang dừng...
                      </>
                    ) : (
                      <>
                        <Square className="h-4 w-4" />
                        Dừng
                      </>
                    )}
                  </Button>
                )}
                
                <Button 
                  type="button" 
                  variant="outline"
                  onClick={() => navigate("/viewcount")}
                  disabled={isProcessing}
                >
                  Xem thống kê
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
        )}

        {/* Direct Edit Form */}
        {editMode === 'edit' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Chỉnh sửa trực tiếp
              </CardTitle>
              <CardDescription>
                Đặt chính xác số view hiển thị trên trang thống kê. Số nhập vào sẽ là tổng số view hiển thị (không cộng thêm). Để trống nếu không muốn thay đổi.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleDirectEdit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Yesterday Views */}
                  <div className="space-y-2">
                    <Label htmlFor="editYesterday">View hôm qua</Label>
                    <Input
                      id="editYesterday"
                      type="number"
                      placeholder={`Hiện tại: ${currentStats.yesterday}`}
                      value={editValues.yesterday}
                      onChange={(e) => setEditValues(prev => ({ ...prev, yesterday: e.target.value }))}
                      min="0"
                      disabled={isProcessing}
                    />
                    <p className="text-xs text-muted-foreground">
                      Đặt số view hiển thị cho hôm qua
                    </p>
                  </div>

                  {/* Today Views */}
                  <div className="space-y-2">
                    <Label htmlFor="editToday">View hôm nay</Label>
                    <Input
                      id="editToday"
                      type="number"
                      placeholder={`Hiện tại: ${currentStats.today}`}
                      value={editValues.today}
                      onChange={(e) => setEditValues(prev => ({ ...prev, today: e.target.value }))}
                      min="0"
                      disabled={isProcessing}
                    />
                    <p className="text-xs text-muted-foreground">
                      Đặt số view hiển thị cho hôm nay
                    </p>
                  </div>

                  {/* Week Views */}
                  <div className="space-y-2">
                    <Label htmlFor="editWeek">View tuần này</Label>
                    <Input
                      id="editWeek"
                      type="number"
                      placeholder={`Hiện tại: ${currentStats.thisWeek}`}
                      value={editValues.thisWeek}
                      onChange={(e) => setEditValues(prev => ({ ...prev, thisWeek: e.target.value }))}
                      min="0"
                      disabled={isProcessing}
                    />
                    <p className="text-xs text-muted-foreground">
                      Đặt số view hiển thị cho tuần này
                    </p>
                  </div>

                  {/* Month Views */}
                  <div className="space-y-2">
                    <Label htmlFor="editMonth">View tháng này</Label>
                    <Input
                      id="editMonth"
                      type="number"
                      placeholder={`Hiện tại: ${currentStats.thisMonth}`}
                      value={editValues.thisMonth}
                      onChange={(e) => setEditValues(prev => ({ ...prev, thisMonth: e.target.value }))}
                      min="0"
                      disabled={isProcessing}
                    />
                    <p className="text-xs text-muted-foreground">
                      Đặt số view hiển thị cho tháng này
                    </p>
                  </div>

                  {/* Total Views */}
                  <div className="space-y-2">
                    <Label htmlFor="editTotal">Tổng view</Label>
                    <Input
                      id="editTotal"
                      type="number"
                      placeholder={`Hiện tại: ${currentStats.total}`}
                      value={editValues.total}
                      onChange={(e) => setEditValues(prev => ({ ...prev, total: e.target.value }))}
                      min="0"
                      disabled={isProcessing}
                    />
                    <p className="text-xs text-muted-foreground">
                      Đặt tổng số view hiển thị
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <Button 
                    type="submit" 
                    disabled={isProcessing}
                    className="flex items-center gap-2"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Đang cập nhật...
                      </>
                    ) : (
                      <>
                        <Calendar className="h-4 w-4" />
                        Cập nhật View
                      </>
                    )}
                  </Button>
                  
                  <Button 
                    type="button" 
                    variant="outline"
                    onClick={() => navigate("/viewcount")}
                    disabled={isProcessing}
                  >
                    Xem thống kê
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Info Card */}
        <Card>
          <CardHeader>
            <CardTitle>Hướng dẫn sử dụng</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Chế độ "Thêm View":</h4>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>• Thêm view mới vào hệ thống với delay tự nhiên</li>
                  <li>• Chọn thời gian phân bổ (1h-72h)</li>
                  <li>• Có thể dừng quá trình bất cứ lúc nào</li>
                  <li>• Biểu đồ sẽ cập nhật live sau 30 giây</li>
                </ul>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">Chế độ "Chỉnh sửa trực tiếp":</h4>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>• Đặt chính xác số view hiển thị trên trang thống kê</li>
                  <li>• Thay đổi ngay lập tức không cần delay</li>
                  <li>• Để trống nếu không muốn thay đổi</li>
                  <li>• Cập nhật cả biểu đồ và số liệu</li>
                </ul>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">Cập nhật live:</h4>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>• Trang /viewcount tự động refresh mỗi 30 giây</li>
                  <li>• Biểu đồ sử dụng dữ liệu thực từ database</li>
                  <li>• Thay đổi sẽ hiển thị ngay lập tức</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default ViewManagement;
