import { useEffect, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import { Mail, ArrowRight } from "lucide-react";
import logo from "@/assets/logo.png";

const emailSchema = z.object({
  email: z.string().email("Email không hợp lệ").max(255),
});

// Hiện 1 lần / 1 phiên (sessionStorage tự xoá khi đóng tab).
const SESSION_KEY = "luot247_signup_prompt_shown";

interface SignupPromptDialogProps {
  session: Session | null;
  // App đã resolve xong getSession() lần đầu chưa — tránh nháy popup cho user
  // đã đăng nhập trong lúc session còn null (chưa resolve).
  authChecked: boolean;
}

export const SignupPromptDialog = ({ session, authChecked }: SignupPromptDialogProps) => {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!authChecked) return; // chờ biết chắc trạng thái đăng nhập
    if (session) return; // đã đăng nhập → không mời nữa
    // Đang ở trang /auth thì hiện popup mời đăng nhập là thừa.
    if (typeof window !== "undefined" && window.location.pathname.startsWith("/auth")) return;
    if (sessionStorage.getItem(SESSION_KEY)) return; // đã hiện trong phiên này

    // Delay nhẹ cho nội dung load trước → cảm giác mượt, không giật mình.
    const timer = setTimeout(() => {
      setOpen(true);
      sessionStorage.setItem(SESSION_KEY, "1");
    }, 1200);
    return () => clearTimeout(timer);
  }, [authChecked, session]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      emailSchema.parse({ email });
      const trimmedEmail = email.trim();

      // Tài khoản admin cần mật khẩu thật → hướng sang trang đăng nhập.
      if (trimmedEmail === "longth91@gmail.com") {
        toast.info("Tài khoản quản trị, vui lòng đăng nhập tại trang đăng nhập.");
        setOpen(false);
        window.location.href = "/auth";
        return;
      }

      // Auto-login (cùng cơ chế với trang /auth): mật khẩu suy ra từ email.
      const loginPassword = `auto_${trimmedEmail}_pass`;

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password: loginPassword,
      });

      // Chưa có tài khoản → tạo mới rồi đăng nhập ngay.
      if (signInError?.message.includes("Invalid login credentials")) {
        const { error: signUpError } = await supabase.auth.signUp({
          email: trimmedEmail,
          password: loginPassword,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { email: trimmedEmail },
          },
        });

        if (signUpError) {
          // User tồn tại nhưng mật khẩu khác (đăng ký bằng cách khác) → sang /auth.
          if (signUpError.message.toLowerCase().includes("already registered")) {
            toast.info("Email này đã có tài khoản. Vui lòng đăng nhập.");
            setOpen(false);
            window.location.href = "/auth";
            return;
          }
          toast.error("Không thể tạo tài khoản: " + signUpError.message);
          return;
        }

        const { error: finalSignInError } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password: loginPassword,
        });

        // Supabase bật xác nhận email → chưa đăng nhập ngay được.
        if (finalSignInError) {
          toast.success("Tài khoản đã được tạo. Vui lòng kiểm tra email để xác nhận, sau đó đăng nhập lại.");
          setOpen(false);
          return;
        }
      } else if (signInError) {
        toast.error("Không thể đăng nhập: " + signInError.message);
        return;
      }

      localStorage.setItem("rememberedEmail", trimmedEmail);
      toast.success("Đăng nhập thành công! Chào mừng đến Lướt 247 🎉");
      setOpen(false);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      } else {
        toast.error("Có lỗi xảy ra, vui lòng thử lại");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 overflow-hidden sm:max-w-md gap-0 rounded-2xl">
        {/* Nền trắng, logo chuẩn của site + tiêu đề/đoạn mô tả chữ tối */}
        <div className="px-6 pt-8 pb-5 text-center">
          <img src={logo} alt="Lướt 247 - Đọc báo giúp bạn" className="mx-auto mb-5 h-12" />
          <DialogTitle className="text-xl sm:text-2xl font-bold text-foreground tracking-tight whitespace-nowrap">
            Chào mừng đến Lướt 247!
          </DialogTitle>
          {/* Ngắt 2 dòng cố định bằng <br/>. Non-breaking space giữa "Lướt"
              và "247" (&nbsp;) đảm bảo TUYỆT ĐỐI không bao giờ tách "Lướt 247"
              sang 2 dòng dù màn hình rộng/hẹp thế nào. */}
          <DialogDescription className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
            Hãy đăng ký tài khoản để trải nghiệm
            <br />
            Lướt&nbsp;247 trọn vẹn hơn.
          </DialogDescription>
        </div>

        {/* Form: chỉ 1 ô email, nhập xong tự đăng nhập */}
        <form onSubmit={handleSubmit} className="px-6 pb-7 space-y-3">
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="email@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              required
              autoFocus
              className="h-12 pl-10 text-base rounded-xl"
            />
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="group h-12 w-full rounded-xl bg-gradient-to-r from-primary to-[hsl(0_72%_46%)] text-base font-semibold text-primary-foreground shadow-md transition-all hover:brightness-110 hover:shadow-lg"
          >
            {isLoading ? (
              "Đang xử lý..."
            ) : (
              <span className="flex items-center justify-center gap-2">
                Bắt đầu ngay
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
