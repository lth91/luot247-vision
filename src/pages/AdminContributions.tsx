import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { getRelativeTime } from "@/lib/dateUtils";

// Hệ thống thẻ vàng/đỏ (migration 20260705010000).
interface CardRow {
  id: string;
  news_id: string | null;
  news_title: string;
  author_id: string;
  reporter_id: string;
  card_type: "yellow" | "red";
  reason: string;
  status: string;
  created_at: string;
}
interface BannedUser {
  id: string;
  display_name: string | null;
  email: string;
}

const CARD_LABEL: Record<string, string> = { yellow: "🟨 Vàng", red: "🟥 Đỏ" };

const AdminContributions = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [nameById, setNameById] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  // Hệ thống thẻ: hàng chờ + thẻ đã chốt + công phát hiện + danh sách bị cấm.
  const [decidedCards, setDecidedCards] = useState<CardRow[]>([]);
  const [reporterStats, setReporterStats] = useState<{ id: string; yellow: number; red: number; yellowMonth: number; redMonth: number }[]>([]);
  const [bannedUsers, setBannedUsers] = useState<BannedUser[]>([]);
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s); setSessionChecked(true);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session); setSessionChecked(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Gate: role admin HOẶC manager (role mới — vd long@denco.vn).
  useEffect(() => {
    if (!sessionChecked) return;
    if (!session) { navigate("/auth"); return; }
    supabase.from("user_roles").select("role").eq("user_id", session.user.id).maybeSingle()
      .then(({ data }) => {
        const role = data?.role || null;
        setUserRole(role);
        if (role !== "admin" && role !== "manager") {
          toast.error("Bạn không có quyền truy cập trang này.");
          navigate("/");
        }
      });
  }, [sessionChecked, session, navigate]);

  const isManager = userRole === "admin" || userRole === "manager";

  const load = async () => {
    setIsLoading(true);
    // ===== Hệ thống thẻ: hàng chờ + thẻ đã duyệt (công phát hiện) + bị cấm =====
    // Thẻ đã chốt (để soát lại / HỦY thẻ xác nhận nhầm).
    const { data: cardsDecided } = await (supabase as any).from("news_cards")
      .select("*").in("status", ["approved", "rejected", "amnestied", "resolved"])
      .order("reviewed_at", { ascending: false }).limit(50);
    const cd = (cardsDecided as CardRow[]) ?? [];
    setDecidedCards(cd);

    const { data: cardsApproved } = await (supabase as any).from("news_cards")
      .select("reporter_id, card_type, reviewed_at").in("status", ["approved", "resolved"]).limit(1000);
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const byReporter: Record<string, { yellow: number; red: number; yellowMonth: number; redMonth: number }> = {};
    ((cardsApproved as any[]) ?? []).forEach((c) => {
      const s = (byReporter[c.reporter_id] ??= { yellow: 0, red: 0, yellowMonth: 0, redMonth: 0 });
      const inMonth = c.reviewed_at && new Date(c.reviewed_at) >= monthStart;
      if (c.card_type === "red") { s.red++; if (inMonth) s.redMonth++; }
      else { s.yellow++; if (inMonth) s.yellowMonth++; }
    });
    setReporterStats(Object.entries(byReporter)
      .map(([id, s]) => ({ id, ...s }))
      .sort((a, b) => b.red - a.red || b.yellow - a.yellow));

    const { data: banned } = await (supabase as any).from("profiles")
      .select("id, display_name, email").eq("submission_banned", true);
    setBannedUsers((banned as BannedUser[]) ?? []);

    // Map tên (news.submitted_by + author/reporter của thẻ → profiles.id),
    // join thủ công vì không có FK trực tiếp cho PostgREST embed.
    const ids = [...new Set([
      ...cd.flatMap((c) => [c.author_id, c.reporter_id]),
      ...((cardsApproved as any[]) ?? []).map((c) => c.reporter_id),
    ])].filter(Boolean);
    if (ids.length) {
      const { data: profs } = await (supabase as any).from("profiles")
        .select("id, display_name, email").in("id", ids);
      const map: Record<string, string> = {};
      (profs ?? []).forEach((p: any) => { map[p.id] = p.display_name || p.email || "—"; });
      setNameById(map);
    }
    setIsLoading(false);
  };

  useEffect(() => { if (isManager) load(); }, [isManager]);

  // HỦY 1 thẻ đang hiệu lực. Thẻ ĐỎ: nếu tin đang bị gỡ bởi chính thẻ này →
  // RPC tự đăng lại tin + hoàn 10đ cho tác giả. Không tự mở khóa người đang
  // bị cấm — dùng nút Mở khóa riêng.
  const revokeCard = async (c: CardRow) => {
    const extra = c.card_type === "red" ? " Tin sẽ được ĐĂNG LẠI và tác giả được hoàn 10đ." : "";
    if (!window.confirm(`Hủy ${CARD_LABEL[c.card_type]} của "${c.news_title.slice(0, 60)}"?${extra}`)) return;
    const { data, error } = await (supabase as any).rpc("review_news_card", {
      _card_id: c.id, _approve: false, _final_type: null, _note: "Hủy bởi quản lý",
    });
    if (error) { toast.error(error.message || "Không hủy được thẻ."); return; }
    toast.success(data?.restored ? "Đã hủy thẻ — tin được đăng lại, tác giả hoàn 10đ." : "Đã hủy thẻ — không còn tính vào ai nữa.");
    load();
  };

  // Dialog xem đầy đủ nội dung 1 thẻ.
  const [detailCard, setDetailCard] = useState<CardRow | null>(null);

  // XÓA HẲN thẻ khỏi lịch sử (chỉ thẻ KHÔNG còn hiệu lực — thẻ approved phải Hủy trước).
  const deleteCard = async (c: CardRow) => {
    if (!window.confirm(`Xóa hẳn thẻ của "${c.news_title.slice(0, 60)}" khỏi lịch sử?`)) return;
    const { error } = await (supabase as any).rpc("delete_news_card", { _card_id: c.id });
    if (error) { toast.error(error.message || "Không xóa được thẻ."); return; }
    toast.success("Đã xóa thẻ khỏi lịch sử.");
    setDetailCard(null);
    load();
  };

  const liftBan = async (u: BannedUser) => {
    const { error } = await (supabase as any).rpc("lift_submission_ban", { _user_id: u.id });
    if (error) { toast.error(error.message || "Không mở khóa được."); return; }
    toast.success(`Đã mở khóa gửi tin cho ${u.display_name || u.email}. Thẻ cũ chuyển lưu trữ.`);
    load();
  };

  if (!isManager) {
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

        {/* ===== Thẻ đã ghi nhận — mục chính: mọi thẻ hiệu lực ngay khi báo ===== */}
        <Card>
            <CardHeader>
              <CardTitle className="text-base">🚩 Thẻ đã ghi nhận (50 gần nhất)</CardTitle>
              <p className="text-xs text-muted-foreground">
                Thẻ có hiệu lực NGAY khi nhân viên báo (thẻ đỏ tự gỡ tin). "Hủy thẻ" dùng khi báo oan — thẻ đỏ hủy sẽ ĐĂNG LẠI tin + hoàn 10đ. Hủy thẻ KHÔNG tự mở khóa người bị cấm (dùng Mở khóa ở mục dưới).
              </p>
            </CardHeader>
            <CardContent>
              {decidedCards.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">Chưa có thẻ nào. 🎉</p> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tin</TableHead>
                    <TableHead className="w-28">Tác giả</TableHead>
                    <TableHead className="w-28">Người báo</TableHead>
                    <TableHead className="w-20">Mức</TableHead>
                    <TableHead className="w-24">Trạng thái</TableHead>
                    <TableHead className="w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {decidedCards.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="text-sm line-clamp-1">{c.news_title}</div>
                        {/* LÝ DO người báo viết — thông tin chính để hậu kiểm thẻ */}
                        <div className="text-xs text-yellow-800 dark:text-yellow-300 line-clamp-2">Lý do: {c.reason}</div>
                        {(c as any).review_note && (c as any).review_note !== "Tự xác nhận khi báo" && (
                          <div className="text-xs text-muted-foreground line-clamp-1">{(c as any).review_note}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{nameById[c.author_id] || "—"}</TableCell>
                      <TableCell className="text-xs">{nameById[c.reporter_id] || "—"}</TableCell>
                      <TableCell className="text-sm">{CARD_LABEL[c.card_type]}</TableCell>
                      <TableCell className="text-xs">
                        {c.status === "approved" ? <span className="text-green-700 font-medium">✅ Đang hiệu lực</span>
                          : c.status === "resolved" ? <span className="text-blue-600">🛠️ Đã khắc phục</span>
                          : c.status === "rejected" ? <span className="text-muted-foreground">❌ Đã hủy</span>
                          : <span className="text-muted-foreground">🕊️ Ân xá</span>}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Button variant="ghost" size="sm" onClick={() => setDetailCard(c)}>Chi tiết</Button>
                        {c.status === "approved" ? (
                          <Button variant="ghost" size="sm" className="text-red-600" onClick={() => revokeCard(c)}>Hủy thẻ</Button>
                        ) : (
                          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => deleteCard(c)}>Xóa</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              )}
            </CardContent>
          </Card>

        {/* ===== Công phát hiện thẻ (căn cứ thưởng tiền mặt ngoài hệ thống) ===== */}
        <Card>
          <CardHeader><CardTitle className="text-base">🏅 Công phát hiện thẻ (căn cứ khen thưởng)</CardTitle></CardHeader>
          <CardContent>
            {reporterStats.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">Chưa có thẻ nào được xác nhận.</p>
              : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Người phát hiện</TableHead>
                      <TableHead className="text-right">🟥 Đỏ tháng này</TableHead>
                      <TableHead className="text-right">🟥 Đỏ tổng</TableHead>
                      <TableHead className="text-right">🟨 Vàng tháng này</TableHead>
                      <TableHead className="text-right">🟨 Vàng tổng</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reporterStats.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-sm font-medium">{nameById[r.id] || "—"}</TableCell>
                        <TableCell className="text-right font-bold text-red-600">{r.redMonth}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{r.red}</TableCell>
                        <TableCell className="text-right text-yellow-600">{r.yellowMonth}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{r.yellow}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
          </CardContent>
        </Card>

        {/* ===== Đang bị cấm gửi tin ===== */}
        {bannedUsers.length > 0 && (
          <Card className="border-red-300">
            <CardHeader><CardTitle className="text-base text-red-600">⛔ Đang bị cấm gửi tin (đủ 3 thẻ đỏ)</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableBody>
                  {bannedUsers.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="text-sm font-medium">{u.display_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => liftBan(u)}>🔓 Mở khóa</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground mt-2">Mở khóa = ân xá: các thẻ đã tính chuyển sang lưu trữ (không đếm lại), người này gửi tin lại được ngay.</p>
            </CardContent>
          </Card>
        )}

      </main>

      {/* Dialog xem đầy đủ nội dung thẻ */}
      <Dialog open={!!detailCard} onOpenChange={(o) => { if (!o) setDetailCard(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {detailCard ? `${CARD_LABEL[detailCard.card_type]} — ` : ""}
              {detailCard?.status === "approved" ? "Đang hiệu lực"
                : detailCard?.status === "resolved" ? "Đã khắc phục"
                : detailCard?.status === "rejected" ? "Đã hủy" : "Ân xá"}
            </DialogTitle>
          </DialogHeader>
          {detailCard && (
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Tin bị báo</p>
                <p className="font-medium">{detailCard.news_title}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Lý do người báo viết</p>
                <p className="whitespace-pre-wrap">{detailCard.reason}</p>
              </div>
              {(detailCard as any).review_note && (
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Ghi chú xử lý</p>
                  <p>{(detailCard as any).review_note}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Tác giả</p>
                  <p>{nameById[detailCard.author_id] || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Người báo</p>
                  <p>{nameById[detailCard.reporter_id] || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Báo lúc</p>
                  <p>{new Date(detailCard.created_at).toLocaleString("vi-VN")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Chốt lúc</p>
                  <p>{(detailCard as any).reviewed_at ? new Date((detailCard as any).reviewed_at).toLocaleString("vi-VN") : "—"}</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            {detailCard && detailCard.status !== "approved" && (
              <Button variant="outline" className="text-red-600" onClick={() => deleteCard(detailCard)}>Xóa khỏi lịch sử</Button>
            )}
            <Button variant="ghost" onClick={() => setDetailCard(null)}>Đóng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminContributions;
