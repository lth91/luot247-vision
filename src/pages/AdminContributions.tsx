import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { categoryLabel } from "@/lib/newsCategories";
import { getRelativeTime } from "@/lib/dateUtils";

interface Contributor {
  id: string;
  display_name: string | null;
  email: string;
  total_points: number;
  submitted_count: number;
  approved_count: number;
  rejected_count: number;
}
interface UserNews {
  id: string;
  title: string;
  category: string;
  created_at: string;
  submitted_by: string;
}

const AdminContributions = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [news, setNews] = useState<UserNews[]>([]);
  const [nameById, setNameById] = useState<Record<string, string>>({});
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

  // Gate admin-only.
  useEffect(() => {
    if (!sessionChecked) return;
    if (!session) { navigate("/auth"); return; }
    supabase.from("user_roles").select("role").eq("user_id", session.user.id).maybeSingle()
      .then(({ data }) => {
        const role = data?.role || null;
        setUserRole(role);
        if (role !== "admin") {
          toast.error("Bạn không có quyền truy cập trang này.");
          navigate("/");
        }
      });
  }, [sessionChecked, session, navigate]);

  const load = async () => {
    setIsLoading(true);
    const { data: contribs } = await (supabase as any).from("profiles")
      .select("id, display_name, email, total_points, submitted_count, approved_count, rejected_count")
      .gt("submitted_count", 0)
      .order("total_points", { ascending: false })
      .limit(100);
    setContributors((contribs as Contributor[]) ?? []);

    const { data: newsRows } = await (supabase as any).from("news")
      .select("id, title, category, created_at, submitted_by")
      .not("submitted_by", "is", null)
      .eq("is_approved", true)
      .order("created_at", { ascending: false })
      .limit(50);
    const rows = (newsRows as UserNews[]) ?? [];
    setNews(rows);

    // Map tên người gửi (news.submitted_by → profiles.id), join thủ công vì
    // không có FK trực tiếp news→profiles cho PostgREST embed.
    const ids = [...new Set(rows.map((r) => r.submitted_by))];
    if (ids.length) {
      const { data: profs } = await (supabase as any).from("profiles")
        .select("id, display_name, email").in("id", ids);
      const map: Record<string, string> = {};
      (profs ?? []).forEach((p: any) => { map[p.id] = p.display_name || p.email || "—"; });
      setNameById(map);
    }
    setIsLoading(false);
  };

  useEffect(() => { if (userRole === "admin") load(); }, [userRole]);

  const takedown = async (id: string) => {
    // is_approved=true → false: tin biến mất khỏi feed + trigger trừ 5 điểm tác giả.
    const { error } = await supabase.from("news").update({ is_approved: false }).eq("id", id);
    if (error) { toast.error("Không gỡ được tin."); return; }
    toast.success("Đã gỡ tin (tác giả -5 điểm).");
    setNews((prev) => prev.filter((n) => n.id !== id));
  };

  if (userRole !== "admin") {
    return (
      <div className="min-h-screen bg-background">
        <Header user={session?.user} userRole={userRole} />
        <main className="max-w-3xl mx-auto px-4 py-10 text-center text-muted-foreground">Đang kiểm tra quyền...</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header user={session?.user} userRole={userRole} />
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <h1 className="text-xl font-bold">🗂️ Quản lý đóng góp</h1>

        <Card>
          <CardHeader><CardTitle className="text-base">Năng lực người đóng góp</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <p className="text-sm text-muted-foreground py-6 text-center">Đang tải...</p>
              : contributors.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">Chưa có ai gửi tin.</p>
              : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Thành viên</TableHead>
                      <TableHead className="text-right">Gửi</TableHead>
                      <TableHead className="text-right">Đăng</TableHead>
                      <TableHead className="text-right">Loại</TableHead>
                      <TableHead className="text-right">Tỉ lệ</TableHead>
                      <TableHead className="text-right">Điểm</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contributors.map((c) => {
                      const rate = c.submitted_count > 0 ? Math.round((c.approved_count / c.submitted_count) * 100) : 0;
                      return (
                        <TableRow key={c.id}>
                          <TableCell>
                            <div className="text-sm font-medium">{c.display_name || "—"}</div>
                            <div className="text-xs text-muted-foreground">{c.email}</div>
                          </TableCell>
                          <TableCell className="text-right">{c.submitted_count}</TableCell>
                          <TableCell className="text-right text-green-600">{c.approved_count}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{c.rejected_count}</TableCell>
                          <TableCell className="text-right">{rate}%</TableCell>
                          <TableCell className="text-right font-bold text-primary">{c.total_points}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Tin user đã đăng (gỡ nếu sai)</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <p className="text-sm text-muted-foreground py-6 text-center">Đang tải...</p>
              : news.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">Chưa có tin nào.</p>
              : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tiêu đề</TableHead>
                      <TableHead className="w-32">Tác giả</TableHead>
                      <TableHead className="w-24 text-right">Lúc</TableHead>
                      <TableHead className="w-20"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {news.map((n) => (
                      <TableRow key={n.id}>
                        <TableCell>
                          <div className="text-sm font-medium line-clamp-1">{n.title}</div>
                          <div className="text-xs text-muted-foreground">{categoryLabel(n.category)}</div>
                        </TableCell>
                        <TableCell className="text-xs">{nameById[n.submitted_by] || "—"}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">{getRelativeTime(n.created_at)}</TableCell>
                        <TableCell className="text-right">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="text-red-600">Gỡ</Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Gỡ tin này?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tin sẽ bị ẩn khỏi trang chủ và tác giả bị trừ 5 điểm. Có thể hoàn tác bằng cách duyệt lại.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Huỷ</AlertDialogCancel>
                                <AlertDialogAction onClick={() => takedown(n.id)}>Gỡ tin</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default AdminContributions;
