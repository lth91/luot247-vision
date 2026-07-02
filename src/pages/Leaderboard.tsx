import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { useSubmissionAllowed } from "@/hooks/useSubmissionAllowed";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface Row {
  id: string;
  display_name: string | null;
  total_points: number;
  approved_count: number;
}

const MEDAL = ["🥇", "🥈", "🥉"];

const Leaderboard = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
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

  // Tính năng thuộc nhóm gửi tin — chỉ whitelist + admin. Khách/user thường → trang chủ.
  const allowed = useSubmissionAllowed(session?.user?.id);
  useEffect(() => {
    if (sessionChecked && !session) navigate("/");
    if (allowed === false) navigate("/");
  }, [sessionChecked, session, allowed, navigate]);

  useEffect(() => {
    if (session?.user) {
      supabase.from("user_roles").select("role").eq("user_id", session.user.id).maybeSingle()
        .then(({ data }) => setUserRole(data?.role || null));
    }
  }, [session]);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      // KHÔNG select email — bảo vệ riêng tư. Chỉ lấy người có đóng góp.
      const { data } = await (supabase as any).from("profiles")
        .select("id, display_name, total_points, approved_count")
        .gt("total_points", 0)
        .order("total_points", { ascending: false })
        .limit(50);
      setRows((data as Row[]) ?? []);
      setIsLoading(false);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header user={session?.user} userRole={userRole} />
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <h1 className="text-xl font-bold">📊 Bảng xếp hạng đóng góp</h1>
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <p className="text-sm text-muted-foreground py-10 text-center">Đang tải...</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-10 text-center">Chưa có ai trên bảng xếp hạng.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Thành viên</TableHead>
                    <TableHead className="w-20 text-right">Tin đăng</TableHead>
                    <TableHead className="w-20 text-right">Điểm</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{MEDAL[i] ?? i + 1}</TableCell>
                      <TableCell className="font-medium">{r.display_name || "Người dùng"}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{r.approved_count}</TableCell>
                      <TableCell className="text-right font-bold text-primary">{r.total_points}</TableCell>
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

export default Leaderboard;
