import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface HeaderProps {
  user: any;
  userRole: string | null;
}

export const Header = ({ user, userRole }: HeaderProps) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Đã đăng xuất");
    setOpen(false);
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
      <div className="container flex h-16 items-center justify-between">
        <div 
          className="flex items-center cursor-pointer" 
          onClick={() => navigate("/")}
        >
          <h1 className="text-2xl font-bold text-primary italic tracking-wide">
            LUỐT 247
          </h1>
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[280px]">
            <div className="flex flex-col gap-4 mt-8">
              {user ? (
                <>
                  <div className="pb-4 border-b">
                    <p className="text-sm text-muted-foreground">
                      {user.email}
                    </p>
                    {userRole && (
                      <p className="text-xs text-muted-foreground capitalize mt-1">
                        {userRole}
                      </p>
                    )}
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
                    <Button
                      variant="ghost"
                      className="justify-start w-full"
                      onClick={() => {
                        toast.info("Tính năng đang phát triển");
                      }}
                    >
                      📖 Chế độ đọc
                    </Button>
                    <Button
                      variant="ghost"
                      className="justify-start w-full"
                      onClick={() => {
                        toast.info("Tính năng đang phát triển");
                      }}
                    >
                      📄 Bật chế độ đọc lật trang
                    </Button>
                  </div>

                  <Button
                    variant="ghost"
                    className="justify-start mt-4"
                    onClick={handleLogout}
                  >
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
                  <Button
                    variant="ghost"
                    className="justify-start"
                    onClick={() => {
                      toast.info("Tính năng đang phát triển");
                    }}
                  >
                    📖 Chế độ đọc
                  </Button>
                  <Button
                    variant="ghost"
                    className="justify-start"
                    onClick={() => {
                      toast.info("Tính năng đang phát triển");
                    }}
                  >
                    📄 Bật chế độ đọc lật trang
                  </Button>
                </>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
};
