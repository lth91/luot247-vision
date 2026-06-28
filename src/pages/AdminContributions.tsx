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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { categoryLabel } from "@/lib/newsCategories";
import { getRelativeTime } from "@/lib/dateUtils";

// Lý do gỡ tin ↔ mức ảnh hưởng điểm (khớp migration 20260629050000).
// Tổng điểm trừ = thu hồi 10 thưởng gốc + phạt theo lý do.
const TAKEDOWN_REASONS = [
  { value: "system",  label: "Lỗi hệ thống / biên tập (không phải lỗi tác giả)", impact: "−10 (chỉ thu hồi thưởng, không phạt)" },
  { value: "format",  label: "Lỗi nhẹ (sai mục, văn phong, lặp ý)",              impact: "−15 (+1 strike)" },
  { value: "factual", label: "Sai sự thật / bịa số liệu / không kiểm chứng",     impact: "−30 (+1 strike)" },
  { value: "severe",  label: "Bịa hoàn toàn / đạo văn / spam / nội dung cấm",    impact: "−60 (+1 strike)" },
] as const;

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
  // Dialog gỡ tin: tin đang chọn + lý do + ghi chú.
  const [pending, setPending] = useState<UserNews | null>(null);
  const [reason, setReason] = useState<string>("format");
  const [note, setNote] = useState("");
  const [removing, setRemoving] = useState(false);

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

  // Gỡ mềm tin kèm lý do → trigger DB tự thu hồi thưởng + phạt theo mức.
  const confirmTakedown = async () => {
    if (!pending) return;
    setRemoving(true);
    const { error } = await supabase.from("news").update({
      is_approved: false,
      takedown_reason: reason,
      takedown_at: new Date().toISOString(),
      takedown_by: session?.user.id,
      takedown_note: note.trim() || null,
    }).eq("id", pending.id);
    setRemoving(false);
    if (error) { toast.error("Không gỡ được tin: " + error.message); return; }
    const meta = TAKEDOWN_REASONS.find((r) => r.value === reason);
    toast.success(`Đã gỡ tin (${meta?.impact}).`);
    setNews((prev) => prev.filter((n) => n.id !== pending.id));
    setPending(null); setNote(""); setReason("format");
  };

  const openTakedown = (n: UserNews) => { setPending(n); setReason("format"); setNote(""); };

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
                          <Button variant="ghost" size="sm" className="text-red-600" onClick={() => openTakedown(n)}>Gỡ</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
          </CardContent>
        </Card>
      </main>

      {/* Dialog gỡ tin: bắt buộc chọn lý do → quyết mức trừ điểm */}
      <Dialog open={!!pending} onOpenChange={(o) => { if (!o) setPending(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Gỡ tin & áp điểm phạt</DialogTitle>
            <DialogDescription className="line-clamp-2">{pending?.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Lý do gỡ</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TAKEDOWN_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Điểm: <span className="font-semibold text-red-600">{TAKEDOWN_REASONS.find((r) => r.value === reason)?.impact}</span>
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Ghi chú (tuỳ chọn)</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Lý do cụ thể, để đối chiếu khi khiếu nại..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPending(null)} disabled={removing}>Huỷ</Button>
            <Button variant="destructive" onClick={confirmTakedown} disabled={removing}>
              {removing ? "Đang gỡ..." : "Gỡ tin"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminContributions;
