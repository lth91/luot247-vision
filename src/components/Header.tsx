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
import { useReadingContext } from "@/contexts/ReadingContext";

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
  
  // Use ReadingContext for synchronization and read news toggle
  const { syncToFlipMode, syncToScrollMode, shouldHideReadNews, setShouldHideReadNews } = useReadingContext();

  useEffect(() => {
    setReadingMode(location.pathname === "/home2");
  }, [location.pathname]);

  // Keyboard shortcut for mode switching
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl/Cmd + M to toggle between modes
      if ((event.ctrlKey || event.metaKey) && event.key === 'm') {
        event.preventDefault();
        handleReadingModeToggle(!readingMode);
        console.log('⌨️ Keyboard shortcut: Toggling reading mode');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [readingMode, syncToFlipMode, syncToScrollMode]);

  const handleReadingModeToggle = (checked: boolean) => {
    setReadingMode(checked);
    
    // Detect if user is on mobile for appropriate timing
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
    
    if (checked) {
      // Switching to Flip mode - sync to show first unread news
      setOpen(false);
      navigate("/home2");
      // Use longer timeout for mobile to ensure navigation completes
      const flipDelay = isMobile ? 400 : 200;
      setTimeout(() => {
        console.log('🔄 Executing Flip mode sync after navigation');
        syncToFlipMode();
      }, flipDelay);
    } else {
      // Switching to Scroll mode - sync to scroll to current news
      setOpen(false);
      navigate("/");
      
      // Detect if user is on mobile for appropriate timing
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
      
      // Use longer timeout for desktop to ensure DOM is fully rendered
      const scrollDelay = isMobile ? 1000 : 800;
      
      // Additional retry logic for desktop to ensure sync works
      const attemptSync = (attempt = 1) => {
        setTimeout(() => {
          console.log(`🔄 Executing Scroll mode sync attempt ${attempt}`);
          syncToScrollMode();
          
          // If this is desktop and first attempt, try again after a longer delay
          if (!isMobile && attempt === 1) {
            setTimeout(() => {
              console.log('🔄 Desktop: Retrying sync after longer delay');
              syncToScrollMode();
            }, 500);
          }
        }, scrollDelay);
      };
      
      attemptSync();
    }
  };

  const handleLogout = async () => {
    try {
      console.log('🚪 Attempting to sign out...');
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        console.error('❌ Sign out error:', error);
        toast.error("Lỗi khi đăng xuất: " + error.message);
        return;
      }
      
      console.log('✅ Successfully signed out');
      toast.success("Đã đăng xuất");
      setOpen(false);
      navigate("/");
    } catch (error) {
      console.error('❌ Unexpected error during sign out:', error);
      toast.error("Có lỗi xảy ra khi đăng xuất");
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
      <div className="container flex h-14 items-center justify-center relative">
        <button onClick={() => navigate("/")} className="absolute left-1/2 -translate-x-1/2 cursor-pointer flex items-center gap-0">
          <img src={logo} alt="LƯỚT 247" className="h-9" />
          <span className="text-xl font-extrabold italic text-red-600 tracking-tight whitespace-nowrap leading-none ml-1">- ĐỌC BÁO GIÚP BẠN</span>
        </button>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <div className="absolute right-0 flex items-center gap-2">
              <div className="flex items-center gap-1 text-sm text-muted-foreground animate-pulse">
                <span className="font-medium">Menu</span>
                <span className="text-xl">→</span>
              </div>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </div>
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

                  <Button
                    variant="ghost"
                    className="justify-start"
                    onClick={() => {
                      setOpen(false);
                      navigate("/favorites");
                    }}
                  >
                    ❤️ Danh sách yêu thích
                  </Button>

                  <Button
                    variant="ghost"
                    className="justify-start"
                    onClick={() => {
                      setOpen(false);
                      navigate("/about");
                    }}
                  >
                    ℹ️ Về chúng tôi
                  </Button>

                  {(userRole === "admin" || userRole === "moderator") && (
                    <>
                      <div className="border-t pt-4 mt-4">
                        <p className="text-xs text-muted-foreground px-2 mb-2">Quản trị</p>
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
                        {userRole === "admin" && (
                          <>
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
                            <Button
                              variant="ghost"
                              className="justify-start"
                              onClick={() => {
                                setOpen(false);
                                navigate("/quan-ly-view");
                              }}
                            >
                              📊 Quản lý view
                            </Button>
                            <Button
                              variant="ghost"
                              className="justify-start"
                              onClick={() => {
                                setOpen(false);
                                navigate("/lich-su-reset");
                              }}
                            >
                              📜 Lịch sử reset
                            </Button>
                            <Button
                              variant="ghost"
                              className="justify-start"
                              onClick={() => {
                                setOpen(false);
                                navigate("/admin");
                              }}
                            >
                              👥 Quản lý người dùng
                            </Button>
                          </>
                        )}
                      </div>
                    </>
                  )}

                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between px-2 py-2">
                      <Label htmlFor="reading-mode" className="text-sm">
                        📄 Bật chế độ đọc lật trang
                      </Label>
                      <Switch id="reading-mode" checked={readingMode} onCheckedChange={handleReadingModeToggle} />
                    </div>
                    <div className="px-2 py-1">
                      <p className="text-xs text-muted-foreground">
                        ⌨️ Phím tắt: <kbd className="px-1 py-0.5 text-xs bg-muted rounded">Ctrl</kbd> + <kbd className="px-1 py-0.5 text-xs bg-muted rounded">M</kbd>
                      </p>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <Button
                      variant="ghost"
                      className="justify-start w-full"
                      onClick={() => {
                        setOpen(false);
                        setShouldHideReadNews(!shouldHideReadNews);
                      }}
                    >
                      {shouldHideReadNews ? "👁️ Hiển thị tất cả tin đã đọc" : "🙈 Ẩn tin đã đọc"}
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

                  <Button
                    variant="ghost"
                    className="justify-start"
                    onClick={() => {
                      setOpen(false);
                      navigate("/about");
                    }}
                  >
                    ℹ️ Về chúng tôi
                  </Button>

                  <div className="border-t pt-4 mt-4">
                    <div className="flex items-center justify-between px-2 py-2">
                      <Label htmlFor="reading-mode-guest" className="text-sm">
                        📄 Bật chế độ đọc lật trang
                      </Label>
                      <Switch id="reading-mode-guest" checked={readingMode} onCheckedChange={handleReadingModeToggle} />
                    </div>
                    <div className="px-2 py-1">
                      <p className="text-xs text-muted-foreground">
                        ⌨️ Phím tắt: <kbd className="px-1 py-0.5 text-xs bg-muted rounded">Ctrl</kbd> + <kbd className="px-1 py-0.5 text-xs bg-muted rounded">M</kbd>
                      </p>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <Button
                      variant="ghost"
                      className="justify-start w-full"
                      onClick={() => {
                        setOpen(false);
                        setShouldHideReadNews(!shouldHideReadNews);
                      }}
                    >
                      {shouldHideReadNews ? "👁️ Hiển thị tất cả tin đã đọc" : "🙈 Ẩn tin đã đọc"}
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
