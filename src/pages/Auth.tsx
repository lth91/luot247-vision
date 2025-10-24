import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
const emailSchema = z.object({
  email: z.string().email("Email không hợp lệ").max(255)
});
const Auth = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [isSignUp, setIsSignUp] = useState(false);
  
  const isAdminEmail = email.trim() === "longth91@gmail.com";
  useEffect(() => {
    // Check if user is already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/");
      }
    });

    // Check for remembered email
    const rememberedEmail = localStorage.getItem("rememberedEmail");
    if (rememberedEmail) {
      setEmail(rememberedEmail);
      setRememberMe(true);
    }
  }, [navigate]);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      emailSchema.parse({ email });
      const trimmedEmail = email.trim();
      
      // Check if this is admin email - require real password
      const isAdmin = trimmedEmail === "longth91@gmail.com";
      
      if (isAdmin && !password) {
        toast.error("Vui lòng nhập mật khẩu");
        setIsLoading(false);
        return;
      }
      
      if (isSignUp && !isAdmin && !password) {
        toast.error("Vui lòng nhập mật khẩu");
        setIsLoading(false);
        return;
      }
      
      // Generate a consistent password based on email (for auto-login non-admin users)
      const loginPassword = (isAdmin || isSignUp) ? password : `auto_${trimmedEmail}_pass`;
      
      if (isSignUp) {
        // Sign up flow
        const { error: signUpError } = await supabase.auth.signUp({
          email: trimmedEmail,
          password: loginPassword,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: {
              email: trimmedEmail,
            }
          }
        });
        
        if (signUpError) {
          toast.error("Không thể tạo tài khoản: " + signUpError.message);
          setIsLoading(false);
          return;
        }
        
        toast.success("Tài khoản đã được tạo thành công!");
        setIsSignUp(false);
        setPassword("");
      } else {
        // Sign in flow
        let { error: signInError } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password: loginPassword,
        });
        
        // If user doesn't exist, create account automatically (but not for admin)
        if (signInError?.message.includes("Invalid login credentials")) {
          if (isAdmin) {
            toast.error("Email hoặc mật khẩu không đúng");
            setIsLoading(false);
            return;
          }
          
          const { error: signUpError } = await supabase.auth.signUp({
            email: trimmedEmail,
            password: loginPassword,
            options: {
              emailRedirectTo: `${window.location.origin}/`,
              data: {
                email: trimmedEmail,
              }
            }
          });
          
          if (signUpError) {
            toast.error("Không thể tạo tài khoản: " + signUpError.message);
            setIsLoading(false);
            return;
          }
          
          // Try to sign in immediately after signup
          const { error: finalSignInError } = await supabase.auth.signInWithPassword({
            email: trimmedEmail,
            password: loginPassword,
          });
          
          if (finalSignInError) {
            toast.error("Tài khoản đã được tạo. Vui lòng kiểm tra email để xác nhận, sau đó đăng nhập lại.");
            setIsLoading(false);
            return;
          }
        } else if (signInError) {
          toast.error(isAdmin ? "Email hoặc mật khẩu không đúng" : "Không thể đăng nhập: " + signInError.message);
          setIsLoading(false);
          return;
        }
        
        // Handle remember me
        if (rememberMe) {
          localStorage.setItem("rememberedEmail", trimmedEmail);
        } else {
          localStorage.removeItem("rememberedEmail");
        }
        
        toast.success("Đăng nhập thành công!");
        navigate("/");
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      } else {
        toast.error("Có lỗi xảy ra");
      }
    } finally {
      setIsLoading(false);
    }
  };
  return <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <div className="bg-gradient-hero p-3 rounded-lg">
              <span className="text-white font-bold text-2xl">L247</span>
            </div>
          </div>
          <CardTitle className="text-2xl text-center">
            {isSignUp ? "Tạo tài khoản mới" : "Đăng nhập"}
          </CardTitle>
          <CardDescription className="text-center">
            {isSignUp ? "Nhập thông tin để đăng ký" : "Đăng nhập hoặc tạo tài khoản mới"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input 
                id="email" 
                type="email" 
                placeholder="email@example.com" 
                value={email} 
                onChange={e => setEmail(e.target.value)} 
                required 
                disabled={isLoading} 
              />
            </div>
            
            {(isAdminEmail || isSignUp) && (
              <div className="space-y-2">
                <Label htmlFor="password">Mật khẩu</Label>
                <Input 
                  id="password" 
                  type="password" 
                  placeholder="Nhập mật khẩu" 
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                  required 
                  disabled={isLoading} 
                />
              </div>
            )}
            
            {!isSignUp && (
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="remember" 
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                />
                <Label 
                  htmlFor="remember" 
                  className="text-sm font-normal cursor-pointer"
                >
                  Ghi nhớ tài khoản
                </Label>
              </div>
            )}
            
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading 
                ? (isSignUp ? "Đang tạo tài khoản..." : "Đang đăng nhập...") 
                : (isSignUp ? "Đăng ký" : "Đăng nhập")
              }
            </Button>
            
            <div className="text-center">
              <Button
                type="button"
                variant="link"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setPassword("");
                }}
                disabled={isLoading}
                className="text-sm"
              >
                {isSignUp ? "Đã có tài khoản? Đăng nhập" : "Chưa có tài khoản? Đăng ký"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>;
};
export default Auth;