import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import logo from "@/assets/logo247.png";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface HeaderProps {
  user: any;
  userRole: string | null;
  showReadNews?: boolean;
  onToggleReadNews?: () => void;
}

export const Header = ({ user, userRole, showReadNews = false, onToggleReadNews }: HeaderProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [readingMode, setReadingMode] = useState(false);

  useEffect(() => {
    setReadingMode(location.pathname === "/home2");
  }, [location.pathname]);

  const handleReadingModeToggle = (checked: boolean) => {
    setReadingMode(checked);
    if (checked) {
      setOpen(false);
      navigate("/home2");
    } else {
      setOpen(false);
      navigate("/");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Đã đăng xuất");
    setOpen(false);
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
      <div className="container flex h-14 items-center justify-center relative">
        <button onClick={() => navigate("/")} className="absolute left-1/2 -translate-x-1/2 cursor-pointer">
          <img src={logo} alt="LƯỚT 247" className="h-12" />
        </button>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="absolute right-0">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[280px]">
            <div className="flex flex-col gap-4 mt-8">
              {user ? (
                <>
                  <div className="pb-4 border-b">
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                    {userRole && <p className="text-xs text-muted-foreground capitalize mt-1">{userRole}</p>}
                  </div>

                  <Button
                    variant="ghost"
                    className="justify-start"
                    onClick={() => {
                      setOpen(false);
                      navigate("/");
                    }}
                  >
                    📰 Trang chủ
                  </Button>

                  {userRole === "admin" && (
                    <>
                      <Button
                        variant="ghost"
                        className="justify-start"
                        onClick={() => {
                          setOpen(false);
                          navigate("/duyet-tin");
                        }}
                      >
                        ✅ Duyệt tin
                      </Button>
                      <Button
                        variant="ghost"
                        className="justify-start"
                        onClick={() => {
                          setOpen(false);
                          navigate("/tai-du-lieu");
                        }}
                      >
                        📊 Quản lý dữ liệu
                      </Button>
                    </>
                  )}

                  <Button
                    variant="ghost"
                    className="justify-start"
                    onClick={() => {
                      setOpen(false);
                      navigate("/viewcount");
                    }}
                  >
                    📈 Thống kê
                  </Button>

                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between px-2 py-2">
                      <Label htmlFor="reading-mode" className="text-sm">
                        📄 Bật chế độ đọc lật trang
                      </Label>
                      <Switch id="reading-mode" checked={readingMode} onCheckedChange={handleReadingModeToggle} />
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <Button
                      variant="ghost"
                      className="justify-start w-full"
                      onClick={() => {
                        setOpen(false);
                        onToggleReadNews?.();
                      }}
                    >
                      🔄 Reset tin đã đọc
                    </Button>
                  </div>

                  <Button variant="ghost" className="justify-start mt-4" onClick={handleLogout}>
                    🚪 Đăng xuất
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    className="justify-start"
                    onClick={() => {
                      setOpen(false);
                      navigate("/auth");
                    }}
                  >
                    🔐 Đăng nhập
                  </Button>

                  <div className="border-t pt-4 mt-4">
                    <div className="flex items-center justify-between px-2 py-2">
                      <Label htmlFor="reading-mode-guest" className="text-sm">
                        📄 Bật chế độ đọc lật trang
                      </Label>
                      <Switch id="reading-mode-guest" checked={readingMode} onCheckedChange={handleReadingModeToggle} />
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <Button
                      variant="ghost"
                      className="justify-start w-full"
                      onClick={() => {
                        setOpen(false);
                        onToggleReadNews?.();
                      }}
                    >
                      🔄 Reset tin đã đọc
                    </Button>
                  </div>
                </>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
};
