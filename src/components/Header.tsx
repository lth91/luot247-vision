import { Button } from "@/components/ui/button";
import { Menu, User, LogOut, UserCog } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface HeaderProps {
  user: any;
  userRole: string | null;
}

export const Header = ({ user, userRole }: HeaderProps) => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Đã đăng xuất");
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon"
            className="lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
            <div className="bg-gradient-hero p-2 rounded-lg">
              <span className="text-white font-bold text-xl">L247</span>
            </div>
            <h1 className="text-xl font-bold bg-gradient-hero bg-clip-text text-transparent">
              LUOT247
            </h1>
          </div>
        </div>

        <nav className="hidden lg:flex items-center gap-6 text-sm font-medium">
          <Button variant="ghost" onClick={() => navigate("/")}>
            Trang chủ
          </Button>
          {userRole === "admin" && (
            <>
              <Button variant="ghost" onClick={() => navigate("/duyet-tin")}>
                Duyệt tin
              </Button>
              <Button variant="ghost" onClick={() => navigate("/tai-du-lieu")}>
                Quản lý dữ liệu
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={() => navigate("/viewcount")}>
            Thống kê
          </Button>
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <User className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5 text-sm">
                  <p className="font-medium">{user.email}</p>
                  {userRole && (
                    <p className="text-xs text-muted-foreground capitalize">{userRole}</p>
                  )}
                </div>
                <DropdownMenuSeparator />
                {userRole === "admin" && (
                  <>
                    <DropdownMenuItem onClick={() => navigate("/duyet-tin")}>
                      <UserCog className="mr-2 h-4 w-4" />
                      Duyệt tin
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/tai-du-lieu")}>
                      <UserCog className="mr-2 h-4 w-4" />
                      Quản lý dữ liệu
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Đăng xuất
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button onClick={() => navigate("/auth")}>Đăng nhập</Button>
          )}
        </div>
      </div>
    </header>
  );
};
