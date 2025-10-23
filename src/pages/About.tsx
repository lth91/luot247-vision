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
          {/* Hero Section */}
          <div className="text-center space-y-4 pb-8 border-b">
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Về Chúng Tôi
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Nền tảng tin tức nhanh, chính xác và đáng tin cậy
            </p>
          </div>

          {/* Mission Card */}
          <Card className="p-8 shadow-lg border-2">
            <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
              <span className="text-3xl">🎯</span>
              Sứ Mệnh
            </h2>
            <p className="text-muted-foreground leading-relaxed text-lg">
              <span className="font-semibold text-foreground">LƯỚT 247</span> là bản tin vắn được biên soạn từ các nguồn tin chính thống tại Việt Nam, chọn lọc và tóm lược những thông tin quan trọng nhất trong ngày. Nền tảng hướng đến phục vụ cộng đồng với nội dung nhanh gọn, chính xác, đáng tin cậy, giúp người đọc cập nhật kịp thời các sự kiện, chính sách và vấn đề nổi bật trong nước.
            </p>
          </Card>

          {/* Contact Information Card */}
          <Card className="p-8 shadow-lg border-2">
            <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
              <span className="text-3xl">📞</span>
              Thông Tin Liên Hệ
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
                        135 Tirriki Street, Charlestown NSW 2290, Australia
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

          {/* Values Section */}
          <div className="grid md:grid-cols-3 gap-6 pt-4">
            <Card className="p-6 text-center shadow-md hover:shadow-lg transition-shadow">
              <div className="text-4xl mb-3">⚡</div>
              <h3 className="font-semibold text-lg mb-2">Nhanh Gọn</h3>
              <p className="text-sm text-muted-foreground">
                Cập nhật tin tức nhanh chóng, tiết kiệm thời gian
              </p>
            </Card>

            <Card className="p-6 text-center shadow-md hover:shadow-lg transition-shadow">
              <div className="text-4xl mb-3">✓</div>
              <h3 className="font-semibold text-lg mb-2">Chính Xác</h3>
              <p className="text-sm text-muted-foreground">
                Nguồn tin chính thống, đáng tin cậy
              </p>
            </Card>

            <Card className="p-6 text-center shadow-md hover:shadow-lg transition-shadow">
              <div className="text-4xl mb-3">🎯</div>
              <h3 className="font-semibold text-lg mb-2">Trọng Tâm</h3>
              <p className="text-sm text-muted-foreground">
                Chọn lọc những thông tin quan trọng nhất
              </p>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default About;
