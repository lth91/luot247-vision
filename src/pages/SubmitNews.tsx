import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { countWords, SUBMISSION_LIMITS } from "@/lib/newsCategories";
import { useSubmissionAllowed } from "@/hooks/useSubmissionAllowed";

const { titleMin, titleMax, totalMin, totalMax } = SUBMISSION_LIMITS;

// Hiển thị trạng thái word-count: ok / thiếu / thừa. prefix: nhãn thêm phía
// trước (vd "Tổng" cho bộ đếm tiêu đề + nội dung).
function WordHint({ count, min, max, prefix }: { count: number; min: number; max: number; prefix?: string }) {
  let cls = "text-muted-foreground";
  let msg = `${count} từ`;
  if (count > 0 && count < min) { cls = "text-amber-600"; msg = `${count} từ — cần thêm ${min - count}`; }
  else if (count > max) { cls = "text-red-600"; msg = `${count} từ — thừa ${count - max}`; }
  else if (count >= min && count <= max) { cls = "text-green-600"; msg = `${count} từ — OK`; }
  return <span className={`text-xs ${cls}`}>{prefix ? `${prefix}: ` : ""}{msg} (cần {min}–{max})</span>;
}

const SubmitNews = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  // Quyền gửi tin theo whitelist email (null = đang kiểm tra).
  const allowed = useSubmissionAllowed(session?.user?.id);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Import hàng loạt từ Google Sheet
  const [sheetUrl, setSheetUrl] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<any | null>(null);

  // Lịch sử TIN BỊ LOẠI (từ submission_log; RLS chỉ cho đọc log của chính mình).
  const [rejects, setRejects] = useState<any[] | null>(null);
  const [rejectsLoading, setRejectsLoading] = useState(false);

  const loadRejects = async () => {
    if (!session?.user) return;
    setRejectsLoading(true);
    try {
      const { data } = await supabase
        .from("submission_log")
        .select("id, title, status, reject_reason, created_at")
        .eq("user_id", session.user.id) // admin có thể đọc all → lọc về chính mình
        .neq("status", "accepted")
        .eq("dismissed", false)
        .order("created_at", { ascending: false })
        .limit(500);
      // Gộp trùng theo tiêu đề (import lại nhiều lần → giữ bản mới nhất).
      const seen = new Set<string>();
      const deduped = (data || []).filter((r: any) => {
        const k = r.title ? `t:${r.title}` : `id:${r.id}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      setRejects(deduped);
    } catch {
      setRejects([]);
    } finally {
      setRejectsLoading(false);
    }
  };

  // Ẩn 1 dòng đã xử lý (ẩn mọi dòng cùng tiêu đề).
  const dismissReject = async (it: any) => {
    await supabase.rpc("dismiss_submission_log", { _title: it.title ?? null });
    setRejects((prev) => (prev || []).filter((r: any) => (it.title ? r.title !== it.title : r.id !== it.id)));
  };

  // Nhãn thân thiện cho từng loại lỗi.
  const REJECT_LABEL: Record<string, string> = {
    rejected_length: "Sai độ dài",
    rejected_ai: "Dấu hiệu AI",
    rejected_implausible: "Khả nghi",
    rejected_duplicate: "Đã có trên hệ thống",
    rejected_similar: "Trùng tin đã có",
    error: "Lỗi xử lý",
  };

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
    if (session?.user) {
      supabase.from("user_roles").select("role").eq("user_id", session.user.id).maybeSingle()
        .then(({ data }) => setUserRole(data?.role || null));
    }
  }, [session]);

  // Gate: chỉ user đã đăng nhập mới gửi tin.
  useEffect(() => {
    if (sessionChecked && !session) {
      toast.error("Vui lòng đăng nhập để gửi tin.");
      navigate("/auth");
    }
  }, [sessionChecked, session, navigate]);

  const titleWords = countWords(title);
  const contentWords = countWords(content);
  const totalWords = titleWords + contentWords;
  const lengthOk =
    titleWords >= titleMin && titleWords <= titleMax &&
    totalWords >= totalMin && totalWords <= totalMax;
  const canSubmit = lengthOk && !isLoading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsLoading(true);
    try {
      // Chuyên mục do AI tự phân loại trong edge function; nguồn URL không bắt buộc.
      const { data, error } = await supabase.functions.invoke("submit-news", {
        body: { title: title.trim(), content: content.trim() },
      });
      if (error) {
        // Edge trả 4xx/5xx → error.context có body. Cố lấy reason.
        let reason = "Gửi tin thất bại, vui lòng thử lại.";
        try { const j = await (error as any)?.context?.json?.(); if (j?.reason) reason = j.reason; } catch { /* ignore */ }
        toast.error(reason);
        return;
      }
      if (data?.ok) {
        toast.success(data.message || "Tin đã được đăng. +10 điểm!");
        setTitle(""); setContent("");
      } else {
        toast.error(data?.reason || "Tin không được duyệt.");
      }
    } catch (err) {
      toast.error("Có lỗi xảy ra, vui lòng thử lại.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleBulkImport = async () => {
    if (!sheetUrl.trim() || bulkLoading) return;
    setBulkLoading(true);
    setBulkResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("submit-news-bulk", {
        body: { sheetUrl: sheetUrl.trim() },
      });
      if (error) {
        let reason = "Import thất bại, vui lòng thử lại.";
        try { const j = await (error as any)?.context?.json?.(); if (j?.reason) reason = j.reason; } catch { /* ignore */ }
        toast.error(reason);
        return;
      }
      if (data?.ok) {
        toast.success(data.message || "Đã import xong.");
        setBulkResult({ ...data.summary, issues: data.issues || [] });
      } else {
        toast.error(data?.reason || "Import không thành công.");
      }
    } catch (err) {
      toast.error("Có lỗi xảy ra, vui lòng thử lại.");
    } finally {
      setBulkLoading(false);
    }
  };

  // Chưa xác định xong quyền → placeholder ngắn (tránh nháy form rồi biến mất).
  if (session && allowed === null) {
    return (
      <div className="min-h-screen bg-background">
        <Header user={session?.user} userRole={userRole} />
        <main className="max-w-2xl mx-auto px-4 py-6">
          <p className="text-sm text-muted-foreground text-center py-10">Đang kiểm tra quyền truy cập...</p>
        </main>
      </div>
    );
  }

  // Không có quyền gửi tin → thông báo, không hiện form (backend cũng chặn).
  if (session && allowed === false) {
    return (
      <div className="min-h-screen bg-background">
        <Header user={session?.user} userRole={userRole} />
        <main className="max-w-2xl mx-auto px-4 py-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">🔒 Gửi tin</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Chức năng gửi tin hiện chỉ dành cho các tài khoản đã đăng ký.
                Tài khoản <b>{session.user.email}</b> chưa được cấp quyền.
                Vui lòng liên hệ quản trị viên nếu bạn cần gửi tin.
              </p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header user={session?.user} userRole={userRole} />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">✍️ Gửi tin</CardTitle>
            <p className="text-sm text-muted-foreground">
              Tin của bạn được kiểm duyệt tự động (độ dài, trùng lặp, chất lượng) và đăng ngay nếu đạt. Mỗi tin được đăng +10 điểm.
            </p>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="single" onValueChange={(v) => { if (v === "rejects" && rejects === null) loadRejects(); }}>
              <TabsList className="grid w-full grid-cols-3 mb-5">
                <TabsTrigger value="single">Gửi 1 tin</TabsTrigger>
                <TabsTrigger value="bulk">Import Google Sheet</TabsTrigger>
                <TabsTrigger value="rejects">Tin bị loại</TabsTrigger>
              </TabsList>

              {/* TAB 1 — gửi lẻ */}
              <TabsContent value="single">
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="title">Tiêu đề</Label>
                      <WordHint count={titleWords} min={titleMin} max={titleMax} />
                    </div>
                    <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)}
                      placeholder="Tiêu đề ngắn gọn, đúng trọng tâm" disabled={isLoading} />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="content">Nội dung</Label>
                      <WordHint count={totalWords} min={totalMin} max={totalMax} prefix="Tổng tiêu đề + nội dung" />
                    </div>
                    <Textarea id="content" value={content} onChange={(e) => setContent(e.target.value)}
                      placeholder={`Tóm tắt tin sao cho TỔNG tiêu đề + nội dung đạt ${totalMin}–${totalMax} từ, văn phong tự nhiên.`} rows={8} disabled={isLoading} />
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Chuyên mục do AI tự phân loại sau khi gửi — bạn không cần chọn.
                  </p>

                  <Button type="submit" className="w-full" disabled={!canSubmit}>
                    {isLoading ? "Đang kiểm duyệt..." : "Gửi tin"}
                  </Button>
                  {!lengthOk && (title || content) && (
                    <p className="text-xs text-center text-muted-foreground">
                      Cần tiêu đề {titleMin}–{titleMax} từ và tổng tiêu đề + nội dung {totalMin}–{totalMax} từ để gửi.
                    </p>
                  )}
                </form>
              </TabsContent>

              {/* TAB 2 — import hàng loạt từ Google Sheet */}
              <TabsContent value="bulk" className="space-y-4">
                <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">Cách dùng:</p>
                  <p>• Sheet có <b>2 cột</b>: cột A = <b>Tiêu đề</b> ({titleMin}–{titleMax} từ), cột B = <b>Nội dung</b> (tổng tiêu đề + nội dung {totalMin}–{totalMax} từ). Dòng 1 là tiêu đề cột.</p>
                  <p>• Đặt quyền chia sẻ Sheet: <b>Anyone with the link → Viewer</b>.</p>
                  <p>• Tối đa <b>100 tin/lần</b>. Mỗi tin qua kiểm duyệt AI như gửi lẻ; tin đạt được đăng + 10đ.</p>
                  <p>• <b>Import lại an toàn</b>: tin đã đăng sẽ tự bỏ qua (không trừ điểm, không tốn phí). Sửa tin lỗi rồi import lại cả sheet là được.</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="sheetUrl">Link Google Sheet</Label>
                  <Input id="sheetUrl" type="url" value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/..." disabled={bulkLoading} />
                </div>

                <Button className="w-full" onClick={handleBulkImport} disabled={!sheetUrl.trim() || bulkLoading}>
                  {bulkLoading ? "Đang xử lý (có thể mất 30–60 giây)..." : "Import & gửi hàng loạt"}
                </Button>

                {bulkResult && (
                  <div className="rounded-lg border p-3 text-sm space-y-1">
                    <p className="font-semibold">Kết quả import:</p>
                    <p>✅ Đăng thành công: <b className="text-green-600">{bulkResult.accepted}</b>/{bulkResult.total} tin (+{bulkResult.accepted * 10} điểm)</p>
                    {bulkResult.rejected_length > 0 && <p>• Sai độ dài (sửa rồi import lại): {bulkResult.rejected_length}</p>}
                    {bulkResult.duplicate > 0 && <p>• Đã có trên hệ thống, bỏ qua: {bulkResult.duplicate}</p>}
                    {bulkResult.rejected_ai > 0 && <p>• Dấu hiệu AI: {bulkResult.rejected_ai}</p>}
                    {bulkResult.rejected_implausible > 0 && <p>• Khả nghi: {bulkResult.rejected_implausible}</p>}
                    {bulkResult.error > 0 && <p>• Lỗi xử lý: {bulkResult.error}</p>}
                    {bulkResult.skipped > 0 && <p className="text-amber-600">• Chưa kịp xử lý (quá thời gian): {bulkResult.skipped} — import lại để gửi tiếp.</p>}
                    {bulkResult.truncated && <p className="text-amber-600">⚠️ Sheet vượt 100 dòng — phần dư chưa xử lý, import lại để gửi tiếp.</p>}

                    {bulkResult.issues && bulkResult.issues.length > 0 && (
                      <div className="mt-2 pt-2 border-t">
                        <p className="font-semibold text-red-600">Tin cần sửa ({bulkResult.issues.length}):</p>
                        <ul className="mt-1 space-y-1 max-h-60 overflow-y-auto">
                          {bulkResult.issues.map((it: any, idx: number) => (
                            <li key={idx} className="text-xs">
                              <b>Dòng {it.row}</b>: {it.title || "(trống)"} — <span className="text-red-600">{it.reason}</span>
                            </li>
                          ))}
                        </ul>
                        <p className="mt-1 text-xs text-muted-foreground">Sửa các dòng trên trong Google Sheet rồi import lại — tin đã đăng tự bỏ qua.</p>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>

              {/* TAB 3 — tin bị loại của chính nhân viên (để sửa) */}
              <TabsContent value="rejects" className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">
                    Tin bị loại cần sửa (mới nhất lên đầu). Sửa xong & đăng lại thì bấm "Ẩn".
                  </p>
                  <Button variant="outline" size="sm" onClick={loadRejects} disabled={rejectsLoading}>
                    {rejectsLoading ? "Đang tải..." : "Làm mới"}
                  </Button>
                </div>

                {rejectsLoading && rejects === null && (
                  <p className="text-sm text-muted-foreground py-6 text-center">Đang tải...</p>
                )}

                {rejects !== null && rejects.length === 0 && !rejectsLoading && (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    Không có tin nào bị loại. 🎉
                  </p>
                )}

                {rejects !== null && rejects.length > 0 && (
                  <ul className="divide-y rounded-lg border">
                    {rejects.map((it: any) => (
                      <li key={it.id} className="p-3 flex items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <p className="text-sm font-medium leading-snug">{it.title || "(không có tiêu đề)"}</p>
                          <p className="text-xs text-red-600">
                            {REJECT_LABEL[it.status] || "Bị loại"}
                            {it.reject_reason ? ` — ${it.reject_reason}` : ""}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(it.created_at).toLocaleString("vi-VN", {
                              day: "2-digit", month: "2-digit", year: "numeric",
                              hour: "2-digit", minute: "2-digit",
                            })}
                          </p>
                        </div>
                        <Button variant="ghost" size="sm" className="shrink-0 text-xs"
                          onClick={() => dismissReject(it)}>
                          Ẩn
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default SubmitNews;
