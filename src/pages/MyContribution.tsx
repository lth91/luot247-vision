import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { categoryLabel } from "@/lib/newsCategories";
import { getRelativeTime } from "@/lib/dateUtils";

interface ProfileStats {
  total_points: number;
  submitted_count: number;
  approved_count: number;
  rejected_count: number;
}
interface LogRow {
  id: string;
  status: string;
  reject_reason: string | null;
  created_at: string;
  news_id: string | null;
  news?: { title: string; category: string } | null;
}

// Nhãn + màu cho status.
const STATUS_META: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  accepted: { label: "Đã đăng", variant: "default" },
  rejected_length: { label: "Sai độ dài", variant: "secondary" },
  rejected_duplicate: { label: "Trùng URL", variant: "secondary" },
  rejected_similar: { label: "Trùng tiêu đề", variant: "secondary" },
  rejected_ai: { label: "Giọng AI", variant: "destructive" },
  rejected_implausible: { label: "Khả nghi", variant: "destructive" },
  error: { label: "Lỗi hệ thống", variant: "outline" },
};

const MyContribution = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s); setSessionChecked(true);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session); setSessionChecked(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (sessionChecked && !session) { navigate("/auth"); }
  }, [sessionChecked, session, navigate]);

  useEffect(() => {
    if (!session?.user) return;
    const uid = session.user.id;
    (async () => {
      setIsLoading(true);
      const { data: prof } = await (supabase as any).from("profiles")
        .select("total_points, submitted_count, approved_count, rejected_count")
        .eq("id", uid).maybeSingle();
      setStats(prof ? {
        total_points: prof.total_points ?? 0,
        submitted_count: prof.submitted_count ?? 0,
        approved_count: prof.approved_count ?? 0,
        rejected_count: prof.rejected_count ?? 0,
      } : { total_points: 0, submitted_count: 0, approved_count: 0, rejected_count: 0 });

      const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", uid).maybeSingle();
      setUserRole(roleData?.role || null);

      const { data: logData, error } = await (supabase as any).from("submission_log")
        .select("id, status, reject_reason, created_at, news_id, news:news_id(title, category)")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) toast.error("Không tải được lịch sử gửi tin.");
      setLogs((logData as LogRow[]) ?? []);
      setIsLoading(false);
    })();
  }, [session]);

  const passRate = stats && stats.submitted_count > 0
    ? Math.round((stats.approved_count / stats.submitted_count) * 100) : 0;

  return (
    <div className="min-h-screen bg-background">
      <Header user={session?.user} userRole={userRole} />
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <h1 className="text-xl font-bold">🏆 Điểm của tôi</h1>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Điểm" value={stats?.total_points ?? 0} accent />
          <StatCard label="Đã đăng" value={stats?.approved_count ?? 0} />
          <StatCard label="Đã gửi" value={stats?.submitted_count ?? 0} />
          <StatCard label="Tỉ lệ duyệt" value={`${passRate}%`} />
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Lịch sử gửi tin</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Đang tải...</p>
            ) : logs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Bạn chưa gửi tin nào.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tiêu đề / Lý do</TableHead>
                    <TableHead className="w-28">Trạng thái</TableHead>
                    <TableHead className="w-24 text-right">Thời gian</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((l) => {
                    const meta = STATUS_META[l.status] ?? { label: l.status, variant: "outline" as const };
                    return (
                      <TableRow key={l.id}>
                        <TableCell>
                          <div className="text-sm font-medium line-clamp-1">
                            {l.news?.title || l.reject_reason || "—"}
                          </div>
                          {l.news?.category && (
                            <div className="text-xs text-muted-foreground">{categoryLabel(l.news.category)}</div>
                          )}
                        </TableCell>
                        <TableCell><Badge variant={meta.variant}>{meta.label}</Badge></TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {getRelativeTime(l.created_at)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

function StatCard({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4 text-center">
        <div className={`text-2xl font-bold ${accent ? "text-primary" : ""}`}>{value}</div>
        <div className="text-xs text-muted-foreground mt-1">{label}</div>
      </CardContent>
    </Card>
  );
}

export default MyContribution;
