import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  const [emailSent, setEmailSent] = useState(false);
  useEffect(() => {
    // Check if user is already logged in
    supabase.auth.getSession().then(({
      data: {
        session
      }
    }) => {
      if (session) {
        navigate("/");
      }
    });
  }, [navigate]);
  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      emailSchema.parse({
        email
      });
      const {
        error
      } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/`
        }
      });
      if (error) {
        toast.error("Không thể gửi link đăng nhập: " + error.message);
        return;
      }
      setEmailSent(true);
      toast.success("Link đăng nhập đã được gửi! Vui lòng kiểm tra email.");
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
          {emailSent ? <div className="text-center space-y-4 py-8">
              <div className="text-6xl mb-4">📧</div>
              <h3 className="text-xl font-semibold">Kiểm tra email của bạn!</h3>
              <p className="text-muted-foreground">
                Chúng tôi đã gửi link đăng nhập đến <strong>{email}</strong>
              </p>
              <p className="text-sm text-muted-foreground">
                Nhấn vào link trong email để đăng nhập vào tài khoản của bạn.
              </p>
              <Button variant="outline" onClick={() => {
            setEmailSent(false);
            setEmail("");
          }}>
                Gửi lại với email khác
              </Button>
            </div> : <form onSubmit={handleMagicLink} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="email@example.com" value={email} onChange={e => setEmail(e.target.value)} required disabled={isLoading} />
                <p className="text-xs text-muted-foreground">
                  Nhập email để nhận link đăng nhập
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Đang gửi..." : "Gửi link đăng nhập"}
              </Button>
            </form>}
        </CardContent>
      </Card>
    </div>;
};
export default Auth;