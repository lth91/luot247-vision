import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { ThumbsUp, ThumbsDown, Share2, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useReadingContext } from "@/contexts/useReadingContext";
import { useFavorites } from "@/contexts/useFavorites";
import { ShareDialog } from "@/components/ShareDialog";
import { getRelativeTime } from "@/lib/dateUtils";

interface NewsItemProps {
  id: string;
  title: string;
  description: string;
  category: string;
  viewCount: number;
  url?: string;
  createdAt: string;
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
  const [disliked, setDisliked] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  
  // Get highlight state from ReadingContext
  const { highlightedNewsId } = useReadingContext();
  const isHighlighted = highlightedNewsId === id;
  
  // Get favorites state from FavoritesContext
  const { isFavorite, toggleFavorite } = useFavorites();
  const liked = isFavorite(id);

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAuthenticated) {
      toast.error("Vui lòng đăng nhập");
      return;
    }

    await toggleFavorite(id);
    setDisliked(false); // Clear dislike when liking
  };

  const handleDislike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAuthenticated) {
      toast.error("Vui lòng đăng nhập");
      return;
    }
    
    setDisliked(!disliked);
    
    // If disliking and currently liked, remove from favorites
    if (!disliked && liked) {
      await toggleFavorite(id);
    }
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
              {getRelativeTime(createdAt)}
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
