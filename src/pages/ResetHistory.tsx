import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Session } from "@supabase/supabase-js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

interface ResetHistoryRecord {
  id: string;
  reset_at: string;
  yesterday_value: number;
  today_value_before_reset: number;
  week_reset: boolean;
  month_reset: boolean;
  status: string;
  error_message: string | null;
}

const ResetHistory = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [history, setHistory] = useState<ResetHistoryRecord[]>([]);
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
    fetchHistory();
  }, []);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchHistory();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const fetchHistory = async () => {
    try {
      const { data, error } = await supabase
        .from("reset_history")
        .select("*")
        .order("reset_at", { ascending: false })
        .limit(30);

      if (error) {
        console.error("Error fetching reset history:", error);
        toast.error("Không thể tải lịch sử reset");
        return;
      }

      setHistory(data || []);
    } catch (error) {
      console.error("Error:", error);
      toast.error("Có lỗi xảy ra");
    } finally {
      setIsLoading(false);
    }
  };

  const formatDateTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      // Convert to Vietnam time (GMT+7)
      const vietnamTime = new Date(date.getTime() + 7 * 60 * 60 * 1000);
      return format(vietnamTime, "dd/MM/yyyy HH:mm:ss");
    } catch (error) {
      return dateString;
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
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">📜 Lịch sử reset view hàng ngày</h1>
          <Badge variant="outline" className="text-sm">
            Tự động làm mới mỗi 30 giây
          </Badge>
        </div>

        <Card className="p-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>📊 Tổng số lần reset:</span>
              <Badge>{history.length}</Badge>
            </div>

            {history.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>Chưa có lịch sử reset nào</p>
                <p className="text-sm mt-2">Hàm reset sẽ chạy tự động vào 7:00 AM mỗi ngày</p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Thời gian reset</TableHead>
                      <TableHead className="text-right">View hôm qua</TableHead>
                      <TableHead className="text-right">View hôm nay (trước reset)</TableHead>
                      <TableHead className="text-center">Reset tuần</TableHead>
                      <TableHead className="text-center">Reset tháng</TableHead>
                      <TableHead className="text-center">Trạng thái</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="font-medium">
                          {formatDateTime(record.reset_at)}
                          <span className="text-xs text-muted-foreground ml-2">(GMT+7)</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary" className="font-mono">
                            {record.yesterday_value.toLocaleString("vi-VN")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline" className="font-mono">
                            {record.today_value_before_reset.toLocaleString("vi-VN")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {record.week_reset ? (
                            <Badge variant="default" className="bg-blue-500">
                              ✓ Thứ 2
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {record.month_reset ? (
                            <Badge variant="default" className="bg-green-500">
                              ✓ Đầu tháng
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {record.status === "success" ? (
                            <Badge variant="default" className="bg-green-600">
                              ✓ Thành công
                            </Badge>
                          ) : (
                            <Badge variant="destructive">
                              ✗ Lỗi
                            </Badge>
                          )}
                          {record.error_message && (
                            <p className="text-xs text-destructive mt-1">
                              {record.error_message}
                            </p>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="mt-6 p-4 bg-muted rounded-lg space-y-2">
              <p className="text-sm font-medium">📖 Hướng dẫn:</p>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>
                  Hàm <code className="px-1 py-0.5 bg-background rounded">reset_daily_view_stats2()</code> tự động chạy vào 7:00 AM mỗi ngày
                </li>
                <li>View "Hôm nay" sẽ được chuyển sang "Hôm qua"</li>
                <li>View "Hôm nay" sẽ được reset về 0 để đếm lại từ đầu</li>
                <li>Vào thứ 2 hàng tuần: View "Tuần này" sẽ được reset</li>
                <li>Vào ngày 1 hàng tháng: View "Tháng này" sẽ được reset</li>
              </ul>
            </div>
          </div>
        </Card>
      </main>
    </div>
  );
};

export default ResetHistory;
