import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Session } from "@supabase/supabase-js";
import { Download, Upload } from "lucide-react";

const categoryLabels = {
  "chinh-tri": "Chính trị",
  "kinh-te": "Kinh tế",
  "xa-hoi": "Xã hội",
  "the-thao": "Thể thao",
  "giai-tri": "Giải trí",
  "cong-nghe": "Công nghệ",
  "khac": "Khác",
};

const DataManagement = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [news, setNews] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) {
        navigate("/auth");
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) {
        navigate("/auth");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (session?.user) {
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .maybeSingle()
        .then(({ data }) => {
          const role = data?.role || null;
          setUserRole(role);
          if (role !== "admin") {
            toast.error("Bạn không có quyền truy cập trang này");
            navigate("/");
          }
        });
    }
  }, [session, navigate]);

  useEffect(() => {
    if (session && userRole === "admin") {
      fetchNews();
    }
  }, [session, userRole]);

  const fetchNews = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("news")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Không thể tải dữ liệu");
      console.error(error);
    } else {
      setNews(data || []);
    }
    setIsLoading(false);
  };

  const handleExportCSV = () => {
    if (news.length === 0) {
      toast.error("Không có dữ liệu để xuất");
      return;
    }

    const headers = ["ID", "Tiêu đề", "Mô tả", "Danh mục", "Lượt xem", "URL", "Ngày tạo"];
    const csvData = news.map((item) => [
      item.id,
      item.title,
      item.description || "",
      categoryLabels[item.category] || item.category,
      item.view_count,
      item.url || "",
      new Date(item.created_at).toLocaleString("vi-VN"),
    ]);

    const csvContent = [
      headers.join(","),
      ...csvData.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `luot247_data_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();

    toast.success("Đã xuất dữ liệu thành công");
  };

  if (isLoading || userRole !== "admin") {
    return (
      <div className="min-h-screen bg-background">
        <Header user={session?.user} userRole={userRole} />
        <div className="container py-8">
          <p className="text-center">Đang tải...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header user={session?.user} userRole={userRole} />
      <main className="container py-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <h1 className="text-3xl font-bold">Quản lý dữ liệu</h1>
          <div className="flex gap-2">
            <Button onClick={handleExportCSV} variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Xuất CSV
            </Button>
            <Button variant="outline" disabled>
              <Upload className="mr-2 h-4 w-4" />
              Nhập từ Google Sheets
            </Button>
          </div>
        </div>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tiêu đề</TableHead>
                <TableHead>Danh mục</TableHead>
                <TableHead className="text-right">Lượt xem</TableHead>
                <TableHead>Ngày tạo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {news.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Không có dữ liệu
                  </TableCell>
                </TableRow>
              ) : (
                news.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.title}</TableCell>
                    <TableCell>
                      {categoryLabels[item.category] || item.category}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.view_count.toLocaleString("vi-VN")}
                    </TableCell>
                    <TableCell>
                      {new Date(item.created_at).toLocaleDateString("vi-VN")}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>

        <p className="text-sm text-muted-foreground mt-4 text-center">
          Tổng số: {news.length} tin tức
        </p>
      </main>
    </div>
  );
};

export default DataManagement;
