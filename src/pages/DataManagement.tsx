import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Session } from "@supabase/supabase-js";
import { Download, LogOut, KeyRound } from "lucide-react";

const DataManagement = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sheetUrl, setSheetUrl] = useState("");

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
      setIsLoading(false);
    }
  }, [session, userRole]);

  const handlePreviewData = async () => {
    if (!sheetUrl.trim()) {
      toast.error("Vui lòng nhập URL Google Sheet");
      return;
    }

    toast.info("Chức năng đang được phát triển");
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const handleChangePassword = () => {
    toast.info("Chức năng đổi mật khẩu đang được phát triển");
  };

  if (isLoading || userRole !== "admin") {
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
            >
              <Download className="mr-2 h-4 w-4" />
              Xem trước dữ liệu
            </Button>
          </div>
        </Card>
      </main>
    </div>
  );
};

export default DataManagement;
