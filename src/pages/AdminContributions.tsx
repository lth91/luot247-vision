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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  const [pendingCards, setPendingCards] = useState<CardRow[]>([]);
  const [decidedCards, setDecidedCards] = useState<CardRow[]>([]);
  const [voteTally, setVoteTally] = useState<Record<string, { up: number; down: number }>>({});
  const [reporterStats, setReporterStats] = useState<{ id: string; yellow: number; red: number; yellowMonth: number; redMonth: number }[]>([]);
  const [bannedUsers, setBannedUsers] = useState<BannedUser[]>([]);
  // Dialog duyệt thẻ: thẻ đang chọn + mức cuối + ghi chú.
  const [reviewCard, setReviewCard] = useState<CardRow | null>(null);
  const [finalType, setFinalType] = useState<"yellow" | "red">("yellow");
  const [reviewNote, setReviewNote] = useState("");
  const [reviewing, setReviewing] = useState(false);

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
    const { data: cardsPending } = await (supabase as any).from("news_cards")
      .select("*").eq("status", "pending").order("created_at", { ascending: false }).limit(100);
    const cp = (cardsPending as CardRow[]) ?? [];
    setPendingCards(cp);

    // Thẻ đã chốt (để soát lại / HỦY thẻ xác nhận nhầm).
    const { data: cardsDecided } = await (supabase as any).from("news_cards")
      .select("*").in("status", ["approved", "rejected", "amnestied"])
      .order("reviewed_at", { ascending: false }).limit(30);
    const cd = (cardsDecided as CardRow[]) ?? [];
    setDecidedCards(cd);

    // Tally vote của các thẻ đang chờ (admin đọc trực tiếp qua RLS).
    if (cp.length) {
      const { data: votes } = await (supabase as any).from("news_card_votes")
        .select("card_id, vote").in("card_id", cp.map((c) => c.id));
      const tally: Record<string, { up: number; down: number }> = {};
      ((votes as any[]) ?? []).forEach((v) => {
        const t = (tally[v.card_id] ??= { up: 0, down: 0 });
        if (v.vote === 1) t.up++; else t.down++;
      });
      setVoteTally(tally);
    } else {
      setVoteTally({});
    }

    const { data: cardsApproved } = await (supabase as any).from("news_cards")
      .select("reporter_id, card_type, reviewed_at").eq("status", "approved").limit(1000);
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
      ...cp.flatMap((c) => [c.author_id, c.reporter_id]),
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

  // ===== Duyệt thẻ =====
  const openReview = (c: CardRow) => { setReviewCard(c); setFinalType(c.card_type); setReviewNote(""); };

  const confirmReview = async (approve: boolean) => {
    if (!reviewCard) return;
    setReviewing(true);
    const { error } = await (supabase as any).rpc("review_news_card", {
      _card_id: reviewCard.id, _approve: approve,
      _final_type: approve ? finalType : null,
      _note: reviewNote.trim() || null,
    });
    setReviewing(false);
    if (error) { toast.error(error.message || "Không xử lý được thẻ."); return; }
    toast.success(approve ? `Đã xác nhận ${CARD_LABEL[finalType]} cho ${nameById[reviewCard.author_id] || "tác giả"}.` : "Đã từ chối báo cáo.");
    setReviewCard(null);
    load(); // refresh: hàng chờ, công phát hiện, danh sách cấm có thể đổi
  };

  // Từ chối nhanh không cần mở dialog.
  const quickReject = async (c: CardRow) => {
    const { error } = await (supabase as any).rpc("review_news_card", {
      _card_id: c.id, _approve: false, _final_type: null, _note: null,
    });
    if (error) { toast.error(error.message || "Không xử lý được."); return; }
    toast.success("Đã từ chối báo cáo.");
    setPendingCards((prev) => prev.filter((x) => x.id !== c.id));
  };

  // HỦY 1 thẻ đã xác nhận (approved → rejected). Không tự mở khóa người đang
  // bị cấm — dùng nút Mở khóa riêng (tránh tự động 2 chiều khó lường).
  const revokeCard = async (c: CardRow) => {
    if (!window.confirm(`Hủy ${CARD_LABEL[c.card_type]} của "${c.news_title.slice(0, 60)}"?`)) return;
    const { error } = await (supabase as any).rpc("review_news_card", {
      _card_id: c.id, _approve: false, _final_type: null, _note: "Hủy bởi quản lý",
    });
    if (error) { toast.error(error.message || "Không hủy được thẻ."); return; }
    toast.success("Đã hủy thẻ — không còn tính vào ai nữa.");
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

        {/* ===== Thẻ chờ duyệt ===== */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">🚩 Thẻ đang biểu quyết ({pendingCards.length})</CardTitle>
            <p className="text-xs text-muted-foreground">Cộng đồng vote trên trang Bảng xếp hạng, chênh ±3 tự chốt. Admin có thể PHỦ QUYẾT ngay tại đây không cần chờ vote.</p>
          </CardHeader>
          <CardContent>
            {isLoading ? <p className="text-sm text-muted-foreground py-6 text-center">Đang tải...</p>
              : pendingCards.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">Không có báo cáo nào chờ xử lý. 🎉</p>
              : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tin bị báo</TableHead>
                      <TableHead className="w-28">Tác giả</TableHead>
                      <TableHead className="w-28">Người báo</TableHead>
                      <TableHead className="w-20">Mức</TableHead>
                      <TableHead className="w-40"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingCards.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <div className="text-sm font-medium line-clamp-1">{c.news_title}</div>
                          <div className="text-xs text-muted-foreground line-clamp-2">Lý do: {c.reason}</div>
                          <div className="text-xs text-muted-foreground">{getRelativeTime(c.created_at)}</div>
                        </TableCell>
                        <TableCell className="text-xs">{nameById[c.author_id] || "—"}</TableCell>
                        <TableCell className="text-xs">{nameById[c.reporter_id] || "—"}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {CARD_LABEL[c.card_type]}
                          <div className="text-xs text-muted-foreground">👍{voteTally[c.id]?.up ?? 0} 👎{voteTally[c.id]?.down ?? 0}</div>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Button variant="ghost" size="sm" className="text-green-700" onClick={() => openReview(c)}>Xác nhận</Button>
                          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => quickReject(c)}>Từ chối</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
          </CardContent>
        </Card>

        {/* ===== Thẻ đã chốt — soát lại / hủy thẻ xác nhận nhầm ===== */}
        {decidedCards.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">🗂️ Thẻ đã chốt (30 gần nhất)</CardTitle>
              <p className="text-xs text-muted-foreground">
                "Hủy thẻ" dùng khi thẻ được xác nhận nhầm — thẻ không còn tính cho ai. Lưu ý: hủy thẻ KHÔNG tự mở khóa người đang bị cấm (dùng nút Mở khóa ở mục dưới).
              </p>
            </CardHeader>
            <CardContent>
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
                        <div className="text-xs text-muted-foreground line-clamp-1">{(c as any).review_note || ""}</div>
                      </TableCell>
                      <TableCell className="text-xs">{nameById[c.author_id] || "—"}</TableCell>
                      <TableCell className="text-xs">{nameById[c.reporter_id] || "—"}</TableCell>
                      <TableCell className="text-sm">{CARD_LABEL[c.card_type]}</TableCell>
                      <TableCell className="text-xs">
                        {c.status === "approved" ? <span className="text-green-700 font-medium">✅ Đã tính</span>
                          : c.status === "rejected" ? <span className="text-muted-foreground">❌ Đã hủy</span>
                          : <span className="text-muted-foreground">🕊️ Ân xá</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        {c.status === "approved" && (
                          <Button variant="ghost" size="sm" className="text-red-600" onClick={() => revokeCard(c)}>Hủy thẻ</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

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

      {/* Dialog xác nhận thẻ: admin quyết mức cuối (được đổi so với đề xuất) */}
      <Dialog open={!!reviewCard} onOpenChange={(o) => { if (!o) setReviewCard(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Xác nhận thẻ</DialogTitle>
            <DialogDescription className="line-clamp-2">{reviewCard?.news_title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-sm space-y-1">
              <p>Tác giả: <b>{reviewCard ? (nameById[reviewCard.author_id] || "—") : ""}</b></p>
              <p>Người báo: <b>{reviewCard ? (nameById[reviewCard.reporter_id] || "—") : ""}</b> — đề xuất {reviewCard ? CARD_LABEL[reviewCard.card_type] : ""}</p>
              <p className="text-muted-foreground">Lý do: {reviewCard?.reason}</p>
            </div>
            <div className="space-y-1.5">
              <Label>Mức thẻ cuối cùng (admin quyết)</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant={finalType === "yellow" ? "default" : "outline"}
                  className={finalType === "yellow" ? "bg-yellow-500 hover:bg-yellow-600 text-black" : ""}
                  onClick={() => setFinalType("yellow")}>🟨 Thẻ vàng</Button>
                <Button type="button" variant={finalType === "red" ? "default" : "outline"}
                  className={finalType === "red" ? "bg-red-600 hover:bg-red-700" : ""}
                  onClick={() => setFinalType("red")}>🟥 Thẻ đỏ</Button>
              </div>
              <p className="text-xs text-muted-foreground">2 vàng = 1 đỏ khi đếm ngưỡng cấm. Đủ 3 đỏ hiệu lực → tự cấm gửi tin.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Ghi chú (tuỳ chọn)</Label>
              <Textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} rows={2}
                placeholder="Căn cứ xác nhận, để đối chiếu khi khiếu nại..." />
            </div>
            <p className="text-xs text-muted-foreground">
              Xác nhận thẻ KHÔNG tự gỡ tin và không trừ điểm — muốn hạ bài dùng nút "Gỡ" ở bảng tin bên dưới.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReviewCard(null)} disabled={reviewing}>Huỷ</Button>
            <Button variant="outline" onClick={() => confirmReview(false)} disabled={reviewing}>Từ chối</Button>
            <Button onClick={() => confirmReview(true)} disabled={reviewing}>
              {reviewing ? "Đang xử lý..." : "Xác nhận thẻ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminContributions;
