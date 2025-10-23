import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Heart, Share2, Copy, Eye } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface NewsCardProps {
  id: string;
  title: string;
  description: string;
  category: string;
  viewCount: number;
  url?: string;
  createdAt: string;
  isFavorite?: boolean;
  onFavoriteToggle?: () => void;
  isAuthenticated: boolean;
}

const categoryLabels: Record<string, string> = {
  "chinh-tri": "Chính trị",
  "kinh-te": "Kinh tế",
  "xa-hoi": "Xã hội",
  "the-thao": "Thể thao",
  "giai-tri": "Giải trí",
  "cong-nghe": "Công nghệ",
  "khac": "Khác",
};

export const NewsCard = ({
  id,
  title,
  description,
  category,
  viewCount,
  url,
  createdAt,
  isFavorite = false,
  onFavoriteToggle,
  isAuthenticated,
}: NewsCardProps) => {
  const [localFavorite, setLocalFavorite] = useState(isFavorite);
  const navigate = useNavigate();

  const handleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAuthenticated) {
      toast.error("Vui lòng đăng nhập để lưu tin yêu thích");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Vui lòng đăng nhập");
        return;
      }

      if (localFavorite) {
        const { error } = await supabase
          .from("favorites")
          .delete()
          .eq("news_id", id);
        if (error) throw error;
        toast.success("Đã xóa khỏi yêu thích");
      } else {
        const { error } = await supabase
          .from("favorites")
          .insert({ news_id: id, user_id: user.id });
        if (error) throw error;
        toast.success("Đã thêm vào yêu thích");
      }
      setLocalFavorite(!localFavorite);
      onFavoriteToggle?.();
    } catch (error) {
      console.error("Favorite error:", error);
      toast.error("Có lỗi xảy ra");
    }
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const shareUrl = url || `${window.location.origin}/tin/${id}`;
    try {
      await navigator.share({
        title: title,
        text: description,
        url: shareUrl,
      });
    } catch (error) {
      // Fallback to copy
      handleCopy(e);
    }
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const shareUrl = url || `${window.location.origin}/tin/${id}`;
    await navigator.clipboard.writeText(shareUrl);
    toast.success("Đã sao chép liên kết");
  };

  const handleCardClick = () => {
    // Disabled - do not navigate to detail page
    // navigate(`/tin/${id}`);
  };

  return (
    <Card 
      className="p-4"
      onClick={handleCardClick}
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <Badge variant="secondary" className="mb-2 text-xs">
              {categoryLabels[category] || category}
            </Badge>
            <h3 className="font-semibold text-base leading-snug group-hover:text-primary transition-colors">
              {title}
            </h3>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={handleFavorite}
          >
            <Heart
              className={`h-5 w-5 ${
                localFavorite ? "fill-destructive text-destructive" : ""
              }`}
            />
          </Button>
        </div>

        {description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {description}
          </p>
        )}

        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Eye className="h-4 w-4" />
              <span>{viewCount.toLocaleString("vi-VN")}</span>
            </div>
            <span>{new Date(createdAt).toLocaleDateString("vi-VN")}</span>
          </div>

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={handleShare}>
              <Share2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleCopy}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
};
