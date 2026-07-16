import { Header } from "@/components/Header";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Mail, MapPin } from "lucide-react";

const About = () => {
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const fetchUserRole = async () => {
      if (!user) return;
      
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();

      if (data && !error) {
        setUserRole(data.role);
      }
    };

    fetchUserRole();
  }, [user]);

  return (
    <div className="min-h-screen bg-background">
      <Header user={user} userRole={userRole} />
      
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Mission Content */}
          <Card className="p-8 shadow-lg border-2">
            <p className="text-muted-foreground leading-relaxed text-lg">
              <span className="font-semibold text-red-600">LƯỚT 247</span> – kênh thông tin chọn lọc từ các nguồn chính thống trong nước, tóm lược những sự kiện và chính sách quan trọng nhất mỗi ngày. Nhanh gọn, chính xác, đáng tin cậy, giúp cộng đồng dễ dàng cập nhật thời sự mà không mất nhiều thời gian.
            </p>
            <p className="text-muted-foreground leading-relaxed text-lg mt-4">
              Đọc <span className="font-semibold text-red-600">LƯỚT 247</span> mỗi ngày, bạn vừa nắm bắt kịp thời dòng chảy sự kiện, vừa chủ động hơn trong công việc và cuộc sống.
            </p>
          </Card>

          {/* Contact Information Card */}
          <Card className="p-8 shadow-lg border-2">
            <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
              <span className="text-3xl">📞</span>
              Thông tin liên hệ:
            </h2>
            
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-semibold mb-4 text-primary">
                  HANOI - SYDNEY PTY LTD
                </h3>
                
                <div className="space-y-4">
                  <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
                    <MapPin className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
                    <div>
                      <p className="font-medium mb-1">Địa chỉ</p>
                      <p className="text-muted-foreground">
                        50 Womerah Ave<br />
                        Darlinghurst NSW 2010, Australia
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
                    <Mail className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
                    <div>
                      <p className="font-medium mb-1">Email</p>
                      <a 
                        href="mailto:brian@luot247.com" 
                        className="text-primary hover:underline"
                      >
                        brian@luot247.com
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>

        </div>
      </main>
    </div>
  );
};

export default About;
