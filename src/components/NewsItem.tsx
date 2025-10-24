import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { ThumbsUp, ThumbsDown, Share2, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useReadingContext } from "@/contexts/ReadingContext";
import { ShareDialog } from "@/components/ShareDialog";

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
  isLast?: boolean;
}

export const NewsItem = ({
  id,
  title,
  description,
  createdAt,
  isAuthenticated,
  isLast = false,
}: NewsItemProps) => {
  const navigate = useNavigate();
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  
  // Get highlight state from ReadingContext
  const { highlightedNewsId } = useReadingContext();
  const isHighlighted = highlightedNewsId === id;

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAuthenticated) {
      toast.error("Vui lòng đăng nhập");
      return;
    }

    const newLikedState = !liked;
    setLiked(newLikedState);
    setDisliked(false);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (newLikedState) {
        // Add to favorites
        const { error } = await supabase
          .from('favorites')
          .insert({ user_id: user.id, news_id: id });
        
        if (error && !error.message.includes('duplicate')) {
          throw error;
        }
        toast.success("Đã thêm vào yêu thích");
      } else {
        // Remove from favorites
        const { error } = await supabase
          .from('favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('news_id', id);
        
        if (error) throw error;
        toast.success("Đã xóa khỏi yêu thích");
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
      setLiked(!newLikedState);
    }
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
    setShareDialogOpen(true);
  };

  const handleSearch = (e: React.MouseEvent) => {
    e.stopPropagation();
    const searchQuery = encodeURIComponent(title);
    const googleSearchUrl = `https://www.google.com/search?q=${searchQuery}`;
    window.open(googleSearchUrl, '_blank', 'width=800,height=600');
  };

  const handleClick = () => {
    // Disabled - do not navigate to detail page
    // navigate(`/tin/${id}`);
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
    <>
      <div
        className={`p-4 ${isHighlighted ? 'news-highlight' : ''}`}
        style={{ borderBottom: isLast ? 'none' : '1px solid #e5e7eb' }}
        data-news-id={id}
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

      <ShareDialog
        isOpen={shareDialogOpen}
        onClose={() => setShareDialogOpen(false)}
        newsId={id}
        newsTitle={title}
      />
    </>
  );
};
