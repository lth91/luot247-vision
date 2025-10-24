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
  const [rememberMe, setRememberMe] = useState(true);
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
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      emailSchema.parse({ email });
      const trimmedEmail = email.trim();
      
      // Generate a consistent password based on email (for auto-login)
      const autoPassword = `auto_${trimmedEmail}_pass`;
      
      // Try to sign in first
      let { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password: autoPassword,
      });
      
      // If user doesn't exist, create account automatically
      if (signInError?.message.includes("Invalid login credentials")) {
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: trimmedEmail,
          password: autoPassword,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
          }
        });
        
        if (signUpError) {
          toast.error("Không thể tạo tài khoản: " + signUpError.message);
          return;
        }
        
        // Sign in after signup
        const { error: finalSignInError } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password: autoPassword,
        });
        
        if (finalSignInError) {
          toast.error("Không thể đăng nhập: " + finalSignInError.message);
          return;
        }
      } else if (signInError) {
        toast.error("Không thể đăng nhập: " + signInError.message);
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
          <CardTitle className="text-2xl text-center">Hãy nhập địa chỉ email của bạn 
để đăng nhập</CardTitle>
          <CardDescription className="text-center">
            Đăng nhập hoặc tạo tài khoản mới
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
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
            
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Đang đăng nhập..." : "Đăng nhập"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>;
};
export default Auth;