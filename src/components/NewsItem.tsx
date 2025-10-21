import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ThumbsUp, ThumbsDown, Share2, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface NewsItemProps {
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

export const NewsItem = ({
  id,
  title,
  description,
  createdAt,
  isAuthenticated,
}: NewsItemProps) => {
  const navigate = useNavigate();
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAuthenticated) {
      toast.error("Vui lòng đăng nhập");
      return;
    }
    setLiked(!liked);
    setDisliked(false);
  };

  const handleDislike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAuthenticated) {
      toast.error("Vui lòng đăng nhập");
      return;
    }
    setDisliked(!disliked);
    setLiked(false);
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const shareUrl = `${window.location.origin}/tin/${id}`;
    await navigator.clipboard.writeText(shareUrl);
    toast.success("Đã sao chép liên kết");
  };

  const handleSearch = (e: React.MouseEvent) => {
    e.stopPropagation();
    toast.info("Tính năng tìm kiếm đang phát triển");
  };

  const handleClick = () => {
    navigate(`/tin/${id}`);
  };

  const timeAgo = () => {
    const now = new Date();
    const created = new Date(createdAt);
    const diffMs = now.getTime() - created.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffHours < 1) return "Vừa xong";
    if (diffHours < 24) return `${diffHours} giờ trước`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} ngày trước`;
  };

  return (
    <div
      className="p-4 mb-3 border rounded-lg cursor-pointer hover:bg-muted/30 transition-colors bg-card"
      onClick={handleClick}
    >
      <div>
        <p className="text-base font-semibold leading-relaxed mb-3">
          {title}
        </p>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1 hover:bg-transparent"
              onClick={handleLike}
            >
              <ThumbsUp className={`h-3.5 w-3.5 ${liked ? "fill-current" : ""}`} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1 hover:bg-transparent"
              onClick={handleDislike}
            >
              <ThumbsDown className={`h-3.5 w-3.5 ${disliked ? "fill-current" : ""}`} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1 hover:bg-transparent"
              onClick={handleShare}
            >
              <Share2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1 hover:bg-transparent"
              onClick={handleSearch}
            >
              <Search className="h-3.5 w-3.5" />
            </Button>
          </div>

          <span className="text-xs text-muted-foreground">
            {timeAgo()}
          </span>
        </div>
      </div>
    </div>
  );
};
