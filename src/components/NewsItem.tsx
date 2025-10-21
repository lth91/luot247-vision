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
      className="py-6 px-4 border-b cursor-pointer hover:bg-muted/30 transition-colors"
      onClick={handleClick}
    >
      <div className="max-w-4xl mx-auto">
        <h2 className="text-lg font-normal leading-relaxed mb-3">
          {title}
        </h2>
        
        {description && (
          <p className="text-base text-foreground/90 leading-relaxed mb-4">
            {description}
          </p>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={handleLike}
            >
              <ThumbsUp className={`h-4 w-4 ${liked ? "fill-current" : ""}`} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={handleDislike}
            >
              <ThumbsDown className={`h-4 w-4 ${disliked ? "fill-current" : ""}`} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={handleShare}
            >
              <Share2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={handleSearch}
            >
              <Search className="h-4 w-4" />
            </Button>
          </div>

          <span className="text-sm text-muted-foreground">
            {timeAgo()}
          </span>
        </div>
      </div>
    </div>
  );
};
