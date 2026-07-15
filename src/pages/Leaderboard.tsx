import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useSubmissionAllowed } from "@/hooks/useSubmissionAllowed";

// 1 dòng / nhân viên whitelist — từ RPC get_submission_dashboard (SECURITY
// DEFINER, chỉ whitelist + admin gọi được). sub_* = tin GỬI, acc_* = tin
// qua kiểm duyệt AI & lên trang.
interface DashRow {
  full_name: string | null;
  email: string;
  sub_today: number;
  sub_month: number;
  acc_today: number;
  acc_yesterday: number;
  acc_month: number;
  acc_prev_month: number;
  yellow_cards: number;
  red_cards: number;
  banned: boolean;
}

// Công duyệt tin AI — từ RPC get_review_dashboard (đếm review_log theo whitelist).
interface ReviewRow {
  full_name: string | null;
  email: string;
  duyet_today: number;
  loai_today: number;
  duyet_month: number;
  loai_month: number;
}

interface ViewStats {
  yesterday: number;
  today: number;
  this_week: number;
  this_month: number;
  total: number;
}

// Tỷ lệ duyệt = duyệt/gửi; chưa gửi tin nào → "—".
const rate = (acc: number, sub: number) => (sub > 0 ? `${Math.round((acc / sub) * 100)}%` : "—");

// Cột sắp xếp được: tên + các cột số + tỷ lệ (rate tính từ acc/sub, "—" xếp cuối).
type SortKey = "full_name" | "sub_today" | "sub_month" | "acc_today" | "acc_yesterday" | "acc_month" | "acc_prev_month" | "rate" | "yellow_cards" | "red_cards";

const sortVal = (r: DashRow, key: SortKey): number | string =>
  key === "full_name" ? (r.full_name || "") :
  key === "rate" ? (r.sub_today > 0 ? r.acc_today / r.sub_today : -1) :
  (r[key] ?? 0); // acc_yesterday có thể undefined nếu SQL mới chưa chạy

const Leaderboard = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [rows, setRows] = useState<DashRow[]>([]);
  const [views, setViews] = useState<ViewStats | null>(null);
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // null = giữ thứ tự mặc định từ RPC (tin duyệt tháng này giảm dần).
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);

  // Bấm lần 1: lớn → bé; bấm lần nữa: đảo chiều.
  const toggleSort = (key: SortKey) =>
    setSort((s) => (s?.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));

  const sorted = sort
    ? [...rows].sort((a, b) => {
        const va = sortVal(a, sort.key), vb = sortVal(b, sort.key);
        const c = typeof va === "string"
          ? va.localeCompare(vb as string, "vi")
          : (va as number) - (vb as number);
        return sort.dir === "asc" ? c : -c;
      })
    : rows;

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

  // Tải dữ liệu khi đã xác nhận có quyền (allowed=true) — tránh gọi RPC vô ích.
  useEffect(() => {
    if (allowed !== true) return;
    (async () => {
      setIsLoading(true);
      // RPC mới hơn types.ts auto-generated → cast any (pattern chung của repo).
      const [dash, stats, review, pending] = await Promise.all([
        (supabase as any).rpc("get_submission_dashboard"),
        (supabase as any).rpc("get_view2_stats"),
        (supabase as any).rpc("get_review_dashboard"),
        (supabase as any)
          .from("news")
          .select("id", { count: "exact", head: true })
          .eq("review_status", "pending"),
      ]);
      setRows((dash.data as DashRow[]) ?? []);
      const s = Array.isArray(stats.data) ? stats.data[0] : stats.data;
      setViews((s as ViewStats) ?? null);
      // RPC công duyệt có thể chưa migrate → lỗi thì ẩn bảng, không vỡ trang.
      setReviewRows(review.error ? [] : ((review.data as ReviewRow[]) ?? []));
      setPendingCount(pending.error ? null : (pending.count ?? 0));
      setIsLoading(false);
    })();
  }, [allowed]);

  // Dòng TỔNG CỘNG.
  const sum = rows.reduce(
    (a, r) => ({
      sub_today: a.sub_today + r.sub_today,
      sub_month: a.sub_month + r.sub_month,
      acc_today: a.acc_today + r.acc_today,
      acc_yesterday: a.acc_yesterday + (r.acc_yesterday || 0),
      acc_month: a.acc_month + r.acc_month,
      acc_prev_month: a.acc_prev_month + r.acc_prev_month,
      yellow_cards: a.yellow_cards + (r.yellow_cards || 0),
      red_cards: a.red_cards + (r.red_cards || 0),
    }),
    { sub_today: 0, sub_month: 0, acc_today: 0, acc_yesterday: 0, acc_month: 0, acc_prev_month: 0, yellow_cards: 0, red_cards: 0 },
  );

  // Ô tiêu đề bấm được để sắp xếp; mũi tên chỉ chiều đang áp dụng.
  const SortHead = ({ label, k, className = "" }: { label: string; k: SortKey; className?: string }) => (
    <TableHead className={className}>
      <button type="button" onClick={() => toggleSort(k)}
        className="w-full inline-flex items-center justify-end gap-0.5 hover:text-foreground">
        <span className="whitespace-pre-line">{label}</span>
        <span className="text-[10px] shrink-0">{sort?.key === k ? (sort.dir === "desc" ? "▼" : "▲") : "⇅"}</span>
      </button>
    </TableHead>
  );

  const VIEW_CELLS: { label: string; key: keyof ViewStats }[] = [
    { label: "View hôm nay", key: "today" },
    { label: "View hôm qua", key: "yesterday" },
    { label: "View tuần này", key: "this_week" },
    { label: "View tháng này", key: "this_month" },
    { label: "Cộng dồn", key: "total" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header user={session?.user} userRole={userRole} />
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <h1 className="text-xl font-bold">📊 Bảng theo dõi gửi tin</h1>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <p className="text-sm text-muted-foreground py-10 text-center">Đang tải...</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-10 text-center">Chưa có dữ liệu.</p>
            ) : (
              <div className="[&>div]:max-h-[75vh]">
                {/* shadcn Table tự bọc 1 div overflow-auto — giới hạn chiều cao ĐÚNG lớp đó
                    ([&>div]) để nó thành khung cuộn dọc, khi ấy th sticky mới ghim được. */}
                <Table>
                  {/* Ghim từng ô th (sticky trên thead không ổn định giữa các trình duyệt) */}
                  <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-card [&_th]:shadow-[inset_0_-1px_0_hsl(var(--border))]">
                    <TableRow>
                      {/* Tiêu đề cột cho phép xuống 2 dòng để 11 cột vừa màn desktop, khỏi cuộn ngang.
                          Tên cột theo yêu cầu sếp 09/07: bỏ chữ "Tin", "đăng" → "Up", thêm "Duyệt hôm qua". */}
                      <SortHead label="Tên" k="full_name" className="whitespace-nowrap [&_button]:justify-start" />
                      <TableHead className="whitespace-nowrap">Email đăng ký</TableHead>
                      {/* \n = điểm ngắt dòng cố định (SortHead render whitespace-pre-line):
                          "hôm nay"/"hôm qua"/"tháng này" luôn nguyên cụm trên 1 dòng */}
                      <SortHead label={"Duyệt\nhôm nay"} k="acc_today" className="text-right text-xs leading-tight px-2 min-w-[70px]" />
                      <SortHead label={"Up\nhôm nay"} k="sub_today" className="text-right text-xs leading-tight px-2 min-w-[70px]" />
                      <SortHead label={"Duyệt\nhôm qua"} k="acc_yesterday" className="text-right text-xs leading-tight px-2 min-w-[70px]" />
                      <SortHead label={"Duyệt\ntháng này"} k="acc_month" className="text-right text-xs leading-tight px-2 min-w-[70px]" />
                      <SortHead label={"Duyệt\ntháng trước"} k="acc_prev_month" className="text-right text-xs leading-tight px-2 min-w-[70px]" />
                      <SortHead label={"Tỷ lệ duyệt\nhôm nay"} k="rate" className="text-right text-xs leading-tight px-2 min-w-[80px]" />
                      <SortHead label="Thẻ đỏ" k="red_cards" className="text-right text-xs leading-tight px-2 min-w-[52px]" />
                      <SortHead label="Thẻ vàng" k="yellow_cards" className="text-right text-xs leading-tight px-2 min-w-[52px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map((r) => (
                      <TableRow key={r.email}>
                        <TableCell className="font-medium whitespace-nowrap">
                          {r.full_name || "—"}
                          {r.banned && <span className="ml-1.5 text-[10px] font-bold text-red-600 border border-red-400 rounded px-1 py-0.5 align-middle">⛔ CẤM</span>}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs whitespace-nowrap max-w-[220px] truncate" title={r.email}>{r.email}</TableCell>
                        <TableCell className="text-right px-2">{r.acc_today}</TableCell>
                        <TableCell className="text-right px-2">{r.sub_today}</TableCell>
                        <TableCell className="text-right px-2">{r.acc_yesterday ?? 0}</TableCell>
                        <TableCell className="text-right px-2 font-semibold">{r.acc_month}</TableCell>
                        <TableCell className="text-right px-2 text-muted-foreground">{r.acc_prev_month}</TableCell>
                        <TableCell className="text-right px-2">{rate(r.acc_today, r.sub_today)}</TableCell>
                        <TableCell className={`text-right px-2 ${r.red_cards > 0 ? "font-bold text-red-600" : "text-muted-foreground"}`}>{r.red_cards}</TableCell>
                        <TableCell className={`text-right px-2 ${r.yellow_cards > 0 ? "font-bold text-yellow-600" : "text-muted-foreground"}`}>{r.yellow_cards}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2 font-bold bg-muted/40">
                      <TableCell>TỔNG CỘNG</TableCell>
                      <TableCell />
                      <TableCell className="text-right px-2">{sum.acc_today}</TableCell>
                      <TableCell className="text-right px-2">{sum.sub_today}</TableCell>
                      <TableCell className="text-right px-2">{sum.acc_yesterday}</TableCell>
                      <TableCell className="text-right px-2">{sum.acc_month}</TableCell>
                      <TableCell className="text-right px-2">{sum.acc_prev_month}</TableCell>
                      <TableCell className="text-right px-2">{rate(sum.acc_today, sum.sub_today)}</TableCell>
                      <TableCell className="text-right px-2 text-red-600">{sum.red_cards}</TableCell>
                      <TableCell className="text-right px-2 text-yellow-600">{sum.yellow_cards}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ===== Công duyệt tin AI: ai duyệt/loại bao nhiêu (từ review_log) ===== */}
        {reviewRows.length > 0 && (() => {
          const active = reviewRows.filter((r) => r.duyet_month + r.loai_month > 0);
          const idle = reviewRows.length - active.length;
          const rsum = active.reduce(
            (a, r) => ({
              duyet_today: a.duyet_today + r.duyet_today,
              loai_today: a.loai_today + r.loai_today,
              duyet_month: a.duyet_month + r.duyet_month,
              loai_month: a.loai_month + r.loai_month,
            }),
            { duyet_today: 0, loai_today: 0, duyet_month: 0, loai_month: 0 },
          );
          return (
            <Card>
              <CardContent className="p-0">
                <div className="flex items-center justify-between px-4 pt-4">
                  <h2 className="font-bold">🤖 Duyệt tin tự động</h2>
                  {pendingCount !== null && (
                    <span className={`text-xs font-medium rounded px-2 py-1 ${pendingCount > 300 ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200" : "bg-muted text-muted-foreground"}`}>
                      Hàng đợi còn {pendingCount} tin
                    </span>
                  )}
                </div>
                {active.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-4 py-6">
                    Tháng này chưa ai duyệt tin AI. Nhân viên vào menu → 🤖 Duyệt tin AI để bắt đầu.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tên</TableHead>
                        <TableHead className="text-right text-xs leading-tight px-2 whitespace-pre-line">{"Duyệt\nhôm nay"}</TableHead>
                        <TableHead className="text-right text-xs leading-tight px-2 whitespace-pre-line">{"Loại\nhôm nay"}</TableHead>
                        <TableHead className="text-right text-xs leading-tight px-2 whitespace-pre-line">{"Duyệt\ntháng này"}</TableHead>
                        <TableHead className="text-right text-xs leading-tight px-2 whitespace-pre-line">{"Loại\ntháng này"}</TableHead>
                        <TableHead className="text-right text-xs leading-tight px-2 whitespace-pre-line">{"Tỷ lệ\nduyệt"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {active.map((r) => (
                        <TableRow key={r.email}>
                          <TableCell className="font-medium whitespace-nowrap" title={r.email}>{r.full_name || r.email}</TableCell>
                          <TableCell className="text-right px-2">{r.duyet_today}</TableCell>
                          <TableCell className="text-right px-2 text-muted-foreground">{r.loai_today}</TableCell>
                          <TableCell className="text-right px-2 font-semibold">{r.duyet_month}</TableCell>
                          <TableCell className="text-right px-2 text-muted-foreground">{r.loai_month}</TableCell>
                          <TableCell className="text-right px-2">{rate(r.duyet_month, r.duyet_month + r.loai_month)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="border-t-2 font-bold bg-muted/40">
                        <TableCell>TỔNG CỘNG{idle > 0 ? ` (${idle} người chưa duyệt)` : ""}</TableCell>
                        <TableCell className="text-right px-2">{rsum.duyet_today}</TableCell>
                        <TableCell className="text-right px-2">{rsum.loai_today}</TableCell>
                        <TableCell className="text-right px-2">{rsum.duyet_month}</TableCell>
                        <TableCell className="text-right px-2">{rsum.loai_month}</TableCell>
                        <TableCell className="text-right px-2">{rate(rsum.duyet_month, rsum.duyet_month + rsum.loai_month)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          );
        })()}

        {/* Khối thống kê lượt xem toàn site (nền vàng như mẫu của sếp) */}
        {views && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {VIEW_CELLS.map((c) => (
              <div key={c.key} className="rounded-lg bg-yellow-100 dark:bg-yellow-900/30 p-3 text-center">
                <p className="text-xs font-medium text-yellow-900 dark:text-yellow-200">{c.label}</p>
                <p className="text-lg font-bold text-yellow-950 dark:text-yellow-100">
                  {views[c.key].toLocaleString("vi-VN")}
                </p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Leaderboard;
