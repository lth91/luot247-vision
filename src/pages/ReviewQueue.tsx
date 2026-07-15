import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useSubmissionAllowed } from "@/hooks/useSubmissionAllowed";
import { SUBMISSION_CATEGORIES, SUBMISSION_LIMITS, countWords } from "@/lib/newsCategories";

// Hàng đợi duyệt tin AI crawl (/duyet-tin-ai). Tin do edge crawl-news insert:
// is_approved=false + review_status='pending' + submitted_by NULL. Nhân viên
// whitelist Duyệt / Sửa / Loại qua RPC SECURITY DEFINER (optimistic lock —
// 2 người cùng bấm 1 tin thì người sau nhận lỗi "đã được xử lý").

interface PendingNews {
  id: string;
  title: string;
  description: string | null;
  url: string | null;
  category: string;
  created_at: string;
  ai_classification: {
    source_name?: string;
    needs_edit?: boolean;
    category_confidence?: number;
    flags?: { is_ad?: boolean; missing_facts?: boolean; is_sensational?: boolean; legal_risk?: boolean };
    published_at_source?: string;
  } | null;
}

interface HistoryRow {
  created_at: string;
  reviewer_name: string;
  action: "approve" | "approve_edited" | "reject";
  news_title: string;
  reason: string | null;
  news_id: string | null;
}

const REJECT_REASONS = [
  "Trùng tin đã có",
  "Sai chuyên mục nghiêm trọng",
  "Không đạt chuẩn nội dung",
  "Quảng cáo / PR",
  "Nhạy cảm / rủi ro pháp lý",
  "Nguồn / bài gốc kém",
];

const CAT_LABEL: Record<string, string> = Object.fromEntries(
  SUBMISSION_CATEGORIES.map((c) => [c.slug, c.label]),
);

const { titleMin, titleMax, totalMin, totalMax } = SUBMISSION_LIMITS;

// Đếm từ + trạng thái đạt/không cho 1 tin (tổng = tiêu đề + nội dung).
const wordInfo = (title: string, content: string) => {
  const tw = countWords(title);
  const total = tw + countWords(content);
  const ok = tw >= titleMin && tw <= titleMax && total >= totalMin && total <= totalMax;
  return { tw, total, ok };
};

const ReviewQueue = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [rows, setRows] = useState<PendingNews[]>([]);
  const [totalPending, setTotalPending] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<string>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  // view: hàng đợi hay lịch sử đã xử lý
  const [view, setView] = useState<"queue" | "history">("queue");
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [onlyRejected, setOnlyRejected] = useState(false);

  // Dialog Sửa
  const [editItem, setEditItem] = useState<PendingNews | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editCategory, setEditCategory] = useState("");

  // Dialog Loại
  const [rejectItem, setRejectItem] = useState<PendingNews | null>(null);
  const [rejectReason, setRejectReason] = useState(REJECT_REASONS[0]);
  const [rejectNote, setRejectNote] = useState("");

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s); setSessionChecked(true);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session); setSessionChecked(true);
    });
    return () => subscription.unsubscribe();
  }, []);

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

  const loadQueue = async () => {
    setIsLoading(true);
    // RLS SELECT news là public; lọc đúng hàng đợi AI. Lấy 200 tin cũ nhất
    // trước (FIFO — tin vào trước duyệt trước, tránh tin "chìm" quá hạn).
    const [{ data, error }, countRes] = await Promise.all([
      (supabase as any)
        .from("news")
        .select("id, title, description, url, category, created_at, ai_classification")
        .eq("review_status", "pending")
        .is("submitted_by", null)
        .order("created_at", { ascending: true })
        .limit(200),
      (supabase as any)
        .from("news")
        .select("id", { count: "exact", head: true })
        .eq("review_status", "pending")
        .is("submitted_by", null),
    ]);
    if (error) {
      toast.error("Không tải được hàng đợi: " + error.message);
    } else {
      setRows((data as PendingNews[]) ?? []);
      setTotalPending(countRes.error ? null : (countRes.count ?? 0));
    }
    setIsLoading(false);
  };

  useEffect(() => {
    if (allowed === true) loadQueue();
  }, [allowed]);

  const loadHistory = async (rejectedOnly: boolean) => {
    setHistoryLoading(true);
    const { data, error } = await (supabase as any).rpc("get_review_history", {
      _limit: 150,
      _only_rejected: rejectedOnly,
    });
    if (error) toast.error("Không tải được lịch sử: " + error.message);
    else setHistory((data as HistoryRow[]) ?? []);
    setHistoryLoading(false);
  };

  useEffect(() => {
    if (view === "history" && allowed === true) loadHistory(onlyRejected);
  }, [view, onlyRejected, allowed]);

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: rows.length };
    for (const r of rows) m[r.category] = (m[r.category] ?? 0) + 1;
    return m;
  }, [rows]);

  const visible = tab === "all" ? rows : rows.filter((r) => r.category === tab);

  const removeRow = (id: string) => setRows((rs) => rs.filter((r) => r.id !== id));

  // Lỗi RPC "đã được người khác xử lý" → gỡ tin khỏi danh sách luôn cho đỡ rối.
  const handleRpcError = (id: string, message: string) => {
    if (message.includes("không còn trong hàng đợi")) {
      removeRow(id);
      toast.info("Tin này vừa được người khác xử lý.");
    } else {
      toast.error(message);
    }
  };

  const approve = async (item: PendingNews) => {
    setBusyId(item.id);
    const { error } = await (supabase as any).rpc("approve_crawled_news", { _news_id: item.id });
    setBusyId(null);
    if (error) return handleRpcError(item.id, error.message);
    removeRow(item.id);
    toast.success("Đã duyệt — tin lên trang ngay.");
  };

  const openEdit = (item: PendingNews) => {
    setEditItem(item);
    setEditTitle(item.title);
    setEditContent(item.description ?? "");
    setEditCategory(item.category);
  };

  const submitEdit = async () => {
    if (!editItem) return;
    const { ok } = wordInfo(editTitle, editContent);
    if (!ok) {
      toast.error("Bản sửa chưa đạt chuẩn số từ — xem bộ đếm dưới ô nhập.");
      return;
    }
    setBusyId(editItem.id);
    const { error } = await (supabase as any).rpc("approve_crawled_news", {
      _news_id: editItem.id,
      _title: editTitle.trim(),
      _content: editContent.trim(),
      _category: editCategory !== editItem.category ? editCategory : null,
    });
    setBusyId(null);
    if (error) return handleRpcError(editItem.id, error.message);
    removeRow(editItem.id);
    setEditItem(null);
    toast.success("Đã duyệt với bản sửa — tin lên trang ngay.");
  };

  const submitReject = async () => {
    if (!rejectItem) return;
    const reason = rejectNote.trim()
      ? `${rejectReason}: ${rejectNote.trim()}`
      : rejectReason;
    setBusyId(rejectItem.id);
    const { error } = await (supabase as any).rpc("reject_crawled_news", {
      _news_id: rejectItem.id,
      _reason: reason,
    });
    setBusyId(null);
    if (error) return handleRpcError(rejectItem.id, error.message);
    removeRow(rejectItem.id);
    setRejectItem(null);
    setRejectNote("");
    toast.success("Đã loại tin.");
  };

  const editWords = wordInfo(editTitle, editContent);
  const editContentMin = Math.max(0, totalMin - (countWords(editTitle) || 15));
  const editContentMax = Math.max(0, totalMax - (countWords(editTitle) || 15));

  return (
    <div className="min-h-screen bg-background">
      <Header user={session?.user} userRole={userRole} />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-xl font-bold">🤖 Tin tự động</h1>
          <div className="flex gap-2">
            <Button size="sm" variant={view === "queue" ? "default" : "outline"} onClick={() => setView("queue")}>
              {/* Hiện "đang tải/tổng" khi hàng đợi lớn hơn 1 trang 200 tin */}
              Hàng đợi ({totalPending !== null && totalPending > (counts.all ?? 0)
                ? `${counts.all ?? 0}/${totalPending}`
                : (counts.all ?? 0)})
            </Button>
            <Button size="sm" variant={view === "history" ? "default" : "outline"} onClick={() => setView("history")}>
              📜 Lịch sử
            </Button>
            {view === "queue" && (
              <Button variant="outline" size="sm" onClick={loadQueue} disabled={isLoading}>
                {isLoading ? "Đang tải..." : "↻"}
              </Button>
            )}
          </div>
        </div>

        {/* ===== VIEW LỊCH SỬ: ai duyệt/loại tin nào, lý do ===== */}
        {view === "history" && (
          <div className="space-y-3">
            <div className="flex gap-1.5">
              <Button size="sm" variant={onlyRejected ? "outline" : "default"} onClick={() => setOnlyRejected(false)}>
                Tất cả
              </Button>
              <Button size="sm" variant={onlyRejected ? "default" : "outline"} onClick={() => setOnlyRejected(true)}>
                Chỉ tin bị loại
              </Button>
            </div>
            {historyLoading ? (
              <p className="text-sm text-muted-foreground py-10 text-center">Đang tải lịch sử...</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-muted-foreground py-10 text-center">Chưa có lượt duyệt/loại nào.</p>
            ) : (
              <div className="space-y-2">
                {history.map((h, i) => (
                  <Card key={i}>
                    <CardContent className="p-3 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        {h.action === "reject"
                          ? <Badge variant="destructive">🗑 Loại</Badge>
                          : h.action === "approve_edited"
                            ? <Badge className="bg-blue-600 hover:bg-blue-600">✏️ Duyệt có sửa</Badge>
                            : <Badge className="bg-green-600 hover:bg-green-600">✅ Duyệt</Badge>}
                        <span className="font-medium">{h.reviewer_name}</span>
                        <span className="text-muted-foreground">
                          {new Date(h.created_at).toLocaleString("vi-VN", {
                            timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <p className="text-sm leading-snug">{h.news_title}</p>
                      {h.action === "reject" && h.reason && (
                        <p className="text-xs text-red-700 dark:text-red-400">Lý do: {h.reason}</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab chuyên mục — bấm để lọc; badge = số tin chờ */}
        {view === "queue" && (
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant={tab === "all" ? "default" : "outline"} onClick={() => setTab("all")}>
            Tất cả ({counts.all ?? 0})
          </Button>
          {SUBMISSION_CATEGORIES.map((c) => (
            (counts[c.slug] ?? 0) > 0 && (
              <Button key={c.slug} size="sm" variant={tab === c.slug ? "default" : "outline"} onClick={() => setTab(c.slug)}>
                {c.label} ({counts[c.slug]})
              </Button>
            )
          ))}
        </div>

        )}

        {view === "queue" && (isLoading ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Đang tải hàng đợi...</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">
            🎉 Hàng đợi trống — chưa có tin AI nào chờ duyệt.
          </p>
        ) : (
          <div className="space-y-3">
            {visible.map((item) => {
              const w = wordInfo(item.title, item.description ?? "");
              const flags = item.ai_classification?.flags ?? {};
              return (
                <Card key={item.id}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold leading-snug">{item.title}</p>
                        <p className="text-sm text-muted-foreground mt-1 whitespace-pre-line">{item.description}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <Badge variant="secondary">{CAT_LABEL[item.category] ?? item.category}</Badge>
                      <Badge variant="outline">{item.ai_classification?.source_name ?? "?"}</Badge>
                      <Badge variant={w.ok ? "outline" : "destructive"}>
                        {w.tw} + {w.total - w.tw} = {w.total} từ{w.ok ? " ✓" : " ✗"}
                      </Badge>
                      {item.ai_classification?.needs_edit && <Badge variant="destructive">✏️ Cần sửa số từ</Badge>}
                      {flags.is_sensational && <Badge variant="destructive">Giật gân?</Badge>}
                      {flags.legal_risk && <Badge variant="destructive">Rủi ro pháp lý?</Badge>}
                      {flags.missing_facts && <Badge variant="destructive">Thiếu dữ kiện?</Badge>}
                      {item.url && (
                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="underline text-muted-foreground hover:text-foreground">
                          Bài gốc ↗
                        </a>
                      )}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" disabled={busyId === item.id || !w.ok}
                        title={w.ok ? "" : "Tin lệch chuẩn số từ — bấm Sửa trước"}
                        onClick={() => approve(item)}>
                        ✅ Duyệt
                      </Button>
                      <Button size="sm" variant="outline" disabled={busyId === item.id} onClick={() => openEdit(item)}>
                        ✏️ Sửa
                      </Button>
                      <Button size="sm" variant="outline" className="text-red-600" disabled={busyId === item.id}
                        onClick={() => { setRejectItem(item); setRejectReason(REJECT_REASONS[0]); setRejectNote(""); }}>
                        🗑 Loại
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {totalPending !== null && totalPending > rows.length && (
              <p className="text-xs text-muted-foreground text-center py-2">
                Đang hiển thị {rows.length} tin CŨ NHẤT trong tổng {totalPending} tin chờ —
                duyệt/loại bớt rồi bấm ↻ để tải đợt tiếp theo.
              </p>
            )}
          </div>
        ))}

        {/* ===== Dialog Sửa & Duyệt ===== */}
        <Dialog open={!!editItem} onOpenChange={(o) => !o && setEditItem(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Sửa rồi duyệt</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Tiêu đề" />
                <p className={`text-xs mt-1 ${countWords(editTitle) >= titleMin && countWords(editTitle) <= titleMax ? "text-muted-foreground" : "text-red-600"}`}>
                  Tiêu đề: {countWords(editTitle)} từ (chuẩn {titleMin}-{titleMax})
                </p>
              </div>
              <div>
                <Textarea rows={7} value={editContent} onChange={(e) => setEditContent(e.target.value)} placeholder="Nội dung" />
                <p className={`text-xs mt-1 ${editWords.ok ? "text-muted-foreground" : "text-red-600"}`}>
                  Nội dung: {editWords.total - editWords.tw} từ (cần {editContentMin}-{editContentMax}) — tổng {editWords.total}/{totalMin}-{totalMax} {editWords.ok ? "✓" : "✗"}
                </p>
              </div>
              <Select value={editCategory} onValueChange={setEditCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SUBMISSION_CATEGORIES.map((c) => (
                    <SelectItem key={c.slug} value={c.slug}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditItem(null)}>Hủy</Button>
              <Button onClick={submitEdit} disabled={!editWords.ok || busyId === editItem?.id}>
                ✅ Duyệt với bản sửa
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ===== Dialog Loại ===== */}
        <Dialog open={!!rejectItem} onOpenChange={(o) => !o && setRejectItem(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Loại tin khỏi hàng đợi</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground line-clamp-2">{rejectItem?.title}</p>
            <div className="space-y-3">
              <Select value={rejectReason} onValueChange={setRejectReason}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REJECT_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="Ghi chú thêm (không bắt buộc)" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectItem(null)}>Hủy</Button>
              <Button variant="destructive" onClick={submitReject} disabled={busyId === rejectItem?.id}>
                🗑 Xác nhận loại
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default ReviewQueue;
