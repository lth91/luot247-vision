import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Session } from "@supabase/supabase-js";
import { Download, LogOut, KeyRound, Upload, Clock } from "lucide-react";

interface NewsPreview {
  title: string;
  description?: string;
  category?: string;
  url?: string;
}

interface ImportHistory {
  id: string;
  user_email: string;
  imported_at: string;
  news_count: number;
}

const DataManagement = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sheetUrl, setSheetUrl] = useState("");
  const [previewData, setPreviewData] = useState<NewsPreview[]>([]);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importHistory, setImportHistory] = useState<ImportHistory[]>([]);

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
          if (role !== "admin" && role !== "moderator") {
            toast.error("Bạn không có quyền truy cập trang này");
            navigate("/");
          }
        });
    }
  }, [session, navigate]);

  useEffect(() => {
    if (session && (userRole === "admin" || userRole === "moderator")) {
      setIsLoading(false);
      fetchImportHistory();
    }
  }, [session, userRole]);

  const fetchImportHistory = async () => {
    const { data, error } = await supabase
      .from("import_history")
      .select("*")
      .order("imported_at", { ascending: false })
      .limit(10);

    if (!error && data) {
      setImportHistory(data);
    }
  };

  const handlePreviewData = async () => {
    if (!sheetUrl.trim()) {
      toast.error("Vui lòng nhập URL Google Sheet");
      return;
    }

    setIsPreviewLoading(true);
    setPreviewData([]);

    try {
      const { data, error } = await supabase.functions.invoke('import-google-sheet', {
        body: { sheetUrl, action: 'preview' }
      });

      if (error) throw error;

      if (data.success) {
        setPreviewData(data.data);
        toast.success(`Tìm thấy ${data.count} tin tức`);
      } else {
        toast.error(data.error || "Không thể xem trước dữ liệu");
      }
    } catch (error) {
      console.error('Preview error:', error);
      toast.error("Lỗi khi xem trước dữ liệu. Đảm bảo sheet được chia sẻ công khai.");
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleImportData = async () => {
    if (!sheetUrl.trim()) {
      toast.error("Vui lòng nhập URL Google Sheet");
      return;
    }

    if (previewData.length === 0) {
      toast.error("Vui lòng xem trước dữ liệu trước khi import");
      return;
    }

    setIsImporting(true);
    const estimatedTime = previewData.length * 5; // 5 seconds per item
    toast.info(`Đang upload ${previewData.length} tin. Ước tính: ${Math.floor(estimatedTime / 60)} phút ${estimatedTime % 60} giây`);

    try {
      const { data, error } = await supabase.functions.invoke('import-google-sheet', {
        body: { sheetUrl, action: 'import' }
      });

      if (error) throw error;

      if (data.success) {
        toast.success(data.message);
        setPreviewData([]);
        setSheetUrl("");
        fetchImportHistory(); // Refresh history
      } else {
        toast.error(data.error || "Không thể import dữ liệu");
      }
    } catch (error) {
      console.error('Import error:', error);
      toast.error("Lỗi khi import dữ liệu");
    } finally {
      setIsImporting(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const handleChangePassword = () => {
    toast.info("Chức năng đổi mật khẩu đang được phát triển");
  };

  if (isLoading || (userRole !== "admin" && userRole !== "moderator")) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container py-8">
          <p className="text-center">Đang tải...</p>
        </div>
      </div>
    );
  }

  const displayName = session?.user?.user_metadata?.display_name || session?.user?.email?.split("@")[0];

  return (
    <div className="min-h-screen bg-background">
      <main className="container max-w-5xl py-12 px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-4xl font-bold">Google Sheet</h1>
          <div className="flex items-center gap-4">
            <span className="text-muted-foreground">Xin chào, <span className="font-medium text-foreground">{displayName}</span></span>
            <Button variant="outline" onClick={handleChangePassword}>
              <KeyRound className="mr-2 h-4 w-4" />
              Đổi mật khẩu
            </Button>
            <Button variant="outline" onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Đăng xuất
            </Button>
          </div>
        </div>

        {/* Subtitle */}
        <p className="text-muted-foreground mb-8">
          Nhập link Google Sheet để convert thành JSON và đẩy lên API external
        </p>

        {/* Main Card */}
        <Card className="p-8">
          <h2 className="text-2xl font-semibold mb-6">Google Sheet to JSON</h2>
          
          <div className="space-y-4">
            <div>
              <label htmlFor="sheet-url" className="block text-sm font-medium mb-2">
                Google Sheet URL
              </label>
              <Input
                id="sheet-url"
                type="url"
                placeholder="https://docs.google.com/spreadsheets/d/..."
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                className="w-full"
              />
              <p className="text-sm text-muted-foreground mt-2">
                Đảm bảo sheet đã được chia sẻ công khai hoặc có quyền truy cập
              </p>
            </div>

            <Button 
              onClick={handlePreviewData}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white"
              size="lg"
              disabled={isPreviewLoading || !sheetUrl.trim()}
            >
              <Download className="mr-2 h-4 w-4" />
              {isPreviewLoading ? "Đang tải..." : "Xem trước dữ liệu"}
            </Button>
          </div>
        </Card>

        {/* Import History - Moved to top */}
        {importHistory.length > 0 && (
          <Card className="p-6 mt-6">
            <h3 className="text-xl font-semibold mb-4">Lịch sử upload</h3>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tài khoản</TableHead>
                    <TableHead>Thời gian</TableHead>
                    <TableHead>Số lượng tin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importHistory.map((history) => (
                    <TableRow key={history.id}>
                      <TableCell className="font-medium">{history.user_email}</TableCell>
                      <TableCell>
                        {new Date(history.imported_at).toLocaleString('vi-VN')}
                      </TableCell>
                      <TableCell>
                        <span className="px-2 py-1 bg-secondary rounded text-sm">
                          {history.news_count} tin
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}

        {/* Preview Table */}
        {previewData.length > 0 && (
          <Card className="p-6 mt-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xl font-semibold">
                  Xem trước ({previewData.length} tin tức)
                </h3>
                <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>
                    Thời gian upload: ~{Math.floor((previewData.length * 5) / 60)} phút {(previewData.length * 5) % 60} giây
                  </span>
                </div>
              </div>
              <Button 
                onClick={handleImportData}
                disabled={isImporting}
                className="bg-primary hover:bg-primary/90"
              >
                <Upload className="mr-2 h-4 w-4" />
                {isImporting ? "Đang import..." : "Import vào database"}
              </Button>
            </div>
            
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40%]">Tiêu đề</TableHead>
                    <TableHead className="w-[30%]">Mô tả</TableHead>
                    <TableHead>Danh mục</TableHead>
                    <TableHead className="w-[15%]">URL</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewData.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{item.title}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.description || '-'}
                      </TableCell>
                      <TableCell>
                        <span className="px-2 py-1 bg-secondary rounded text-xs">
                          {item.category || 'khac'}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">
                        {item.url ? (
                          <a 
                            href={item.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            Link
                          </a>
                        ) : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
};

export default DataManagement;
