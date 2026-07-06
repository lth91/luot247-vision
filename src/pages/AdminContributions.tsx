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
import { useContributionManager } from "@/hooks/useContributionManager";

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
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [news, setNews] = useState<UserNews[]>([]);
  const [nameById, setNameById] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  // Dialog gỡ tin: tin đang chọn + lý do + ghi chú.
  const [pending, setPending] = useState<UserNews | null>(null);
  const [reason, setReason] = useState<string>("format");
  const [note, setNote] = useState("");
  const [removing, setRemoving] = useState(false);
  // Hệ thống thẻ: hàng chờ + công phát hiện + danh sách bị cấm.
  const [pendingCards, setPendingCards] = useState<CardRow[]>([]);
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

  // Gate: admin HOẶC "quản lý đóng góp" (contribution_managers — vd long@denco.vn).
  // userRole vẫn load riêng để quyết nút "Gỡ tin" (chỉ admin gỡ được).
  const isManager = useContributionManager(session?.user?.id);
  useEffect(() => {
    if (!sessionChecked) return;
    if (!session) { navigate("/auth"); return; }
    supabase.from("user_roles").select("role").eq("user_id", session.user.id).maybeSingle()
      .then(({ data }) => setUserRole(data?.role || null));
  }, [sessionChecked, session, navigate]);

  useEffect(() => {
    if (isManager === false) {
      toast.error("Bạn không có quyền truy cập trang này.");
      navigate("/");
    }
  }, [isManager, navigate]);

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

    // ===== Hệ thống thẻ: hàng chờ + thẻ đã duyệt (công phát hiện) + bị cấm =====
    const { data: cardsPending } = await (supabase as any).from("news_cards")
      .select("*").eq("status", "pending").order("created_at", { ascending: false }).limit(100);
    const cp = (cardsPending as CardRow[]) ?? [];
    setPendingCards(cp);

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
      ...rows.map((r) => r.submitted_by),
      ...cp.flatMap((c) => [c.author_id, c.reporter_id]),
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

  useEffect(() => { if (isManager === true) load(); }, [isManager]);

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

  const liftBan = async (u: BannedUser) => {
    const { error } = await (supabase as any).rpc("lift_submission_ban", { _user_id: u.id });
    if (error) { toast.error(error.message || "Không mở khóa được."); return; }
    toast.success(`Đã mở khóa gửi tin cho ${u.display_name || u.email}. Thẻ cũ chuyển lưu trữ.`);
    load();
  };

  if (isManager !== true) {
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
                          {/* Gỡ tin + phạt điểm: chỉ admin (RLS UPDATE news); manager chỉ xem. */}
                          {userRole === "admin" && (
                            <Button variant="ghost" size="sm" className="text-red-600" onClick={() => openTakedown(n)}>Gỡ</Button>
                          )}
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
