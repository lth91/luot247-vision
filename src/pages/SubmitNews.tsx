import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SUBMISSION_CATEGORIES, countWords, SUBMISSION_LIMITS } from "@/lib/newsCategories";

const { titleMin, titleMax, contentMin, contentMax } = SUBMISSION_LIMITS;

// Hiển thị trạng thái word-count: ok / thiếu / thừa.
function WordHint({ count, min, max }: { count: number; min: number; max: number }) {
  let cls = "text-muted-foreground";
  let msg = `${count} từ`;
  if (count > 0 && count < min) { cls = "text-amber-600"; msg = `${count} từ — cần thêm ${min - count}`; }
  else if (count > max) { cls = "text-red-600"; msg = `${count} từ — thừa ${count - max}`; }
  else if (count >= min && count <= max) { cls = "text-green-600"; msg = `${count} từ — OK`; }
  return <span className={`text-xs ${cls}`}>{msg} (cần {min}–{max})</span>;
}

const SubmitNews = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<string>("");
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s); setSessionChecked(true);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session); setSessionChecked(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user) {
      supabase.from("user_roles").select("role").eq("user_id", session.user.id).maybeSingle()
        .then(({ data }) => setUserRole(data?.role || null));
    }
  }, [session]);

  // Gate: chỉ user đã đăng nhập mới gửi tin.
  useEffect(() => {
    if (sessionChecked && !session) {
      toast.error("Vui lòng đăng nhập để gửi tin.");
      navigate("/auth");
    }
  }, [sessionChecked, session, navigate]);

  const titleWords = countWords(title);
  const contentWords = countWords(content);
  const lengthOk =
    titleWords >= titleMin && titleWords <= titleMax &&
    contentWords >= contentMin && contentWords <= contentMax;
  const canSubmit = lengthOk && !!category && !isLoading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("submit-news", {
        body: { title: title.trim(), content: content.trim(), url: url.trim() || undefined, declared_category: category },
      });
      if (error) {
        // Edge trả 4xx/5xx → error.context có body. Cố lấy reason.
        let reason = "Gửi tin thất bại, vui lòng thử lại.";
        try { const j = await (error as any)?.context?.json?.(); if (j?.reason) reason = j.reason; } catch { /* ignore */ }
        toast.error(reason);
        return;
      }
      if (data?.ok) {
        toast.success(data.message || "Tin đã được đăng. +10 điểm!");
        setTitle(""); setContent(""); setCategory(""); setUrl("");
      } else {
        toast.error(data?.reason || "Tin không được duyệt.");
      }
    } catch (err) {
      toast.error("Có lỗi xảy ra, vui lòng thử lại.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header user={session?.user} userRole={userRole} />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">✍️ Gửi tin</CardTitle>
            <p className="text-sm text-muted-foreground">
              Tin của bạn được kiểm duyệt tự động (độ dài, trùng lặp, chất lượng) và đăng ngay nếu đạt. Mỗi tin được đăng +10 điểm.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="title">Tiêu đề</Label>
                  <WordHint count={titleWords} min={titleMin} max={titleMax} />
                </div>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)}
                  placeholder="Tiêu đề ngắn gọn, đúng trọng tâm" disabled={isLoading} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="content">Nội dung</Label>
                  <WordHint count={contentWords} min={contentMin} max={contentMax} />
                </div>
                <Textarea id="content" value={content} onChange={(e) => setContent(e.target.value)}
                  placeholder="Tóm tắt tin trong 110–140 từ, văn phong tự nhiên." rows={8} disabled={isLoading} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="category">Chuyên mục</Label>
                <Select value={category} onValueChange={setCategory} disabled={isLoading}>
                  <SelectTrigger id="category"><SelectValue placeholder="Chọn chuyên mục" /></SelectTrigger>
                  <SelectContent>
                    {SUBMISSION_CATEGORIES.map((c) => (
                      <SelectItem key={c.slug} value={c.slug}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">AI sẽ tự phân loại lại nếu cần — đây chỉ là gợi ý của bạn.</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="url">Nguồn (URL, không bắt buộc)</Label>
                <Input id="url" type="url" value={url} onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://..." disabled={isLoading} />
              </div>

              <Button type="submit" className="w-full" disabled={!canSubmit}>
                {isLoading ? "Đang kiểm duyệt..." : "Gửi tin"}
              </Button>
              {!lengthOk && (title || content) && (
                <p className="text-xs text-center text-muted-foreground">
                  Cần đúng độ dài tiêu đề ({titleMin}–{titleMax} từ) và nội dung ({contentMin}–{contentMax} từ) để gửi.
                </p>
              )}
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default SubmitNews;
