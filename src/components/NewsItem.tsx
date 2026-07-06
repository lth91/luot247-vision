import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { ThumbsUp, ThumbsDown, Share2, Search, Flag } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useReadingContext } from "@/contexts/ReadingContext";
import { useFavorites } from "@/contexts/FavoritesContext";
import { ShareDialog } from "@/components/ShareDialog";
import { getRelativeTime } from "@/lib/dateUtils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

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
  shareUrl?: string; // override link chia sẻ (tin điện trỏ về /d)
  // Hệ thống thẻ vàng/đỏ: chỉ thành viên whitelist báo được tin của NGƯỜI KHÁC.
  submittedBy?: string | null;
  currentUserId?: string;
  canReport?: boolean;
}

export const NewsItem = ({
  id,
  title,
  description,
  createdAt,
  isAuthenticated,
  isLast = false,
  shareUrl,
  submittedBy,
  currentUserId,
  canReport = false,
}: NewsItemProps) => {
  const navigate = useNavigate();
  const [disliked, setDisliked] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  // Dialog báo thẻ
  const [reportOpen, setReportOpen] = useState(false);
  const [cardType, setCardType] = useState<"yellow" | "red">("yellow");
  const [cardReason, setCardReason] = useState("");
  const [reporting, setReporting] = useState(false);

  // Nút 🚩 chỉ hiện với thành viên whitelist, trên tin do NGƯỜI KHÁC gửi.
  const showReport = canReport && !!submittedBy && submittedBy !== currentUserId;

  const submitReport = async () => {
    if (cardReason.trim().split(/\s+/).filter(Boolean).length < 5) {
      toast.error("Vui lòng ghi lý do cụ thể (ít nhất 5 từ).");
      return;
    }
    setReporting(true);
    // RPC mới hơn types.ts auto-generated → cast any (pattern chung của repo).
    const { error } = await (supabase as any).rpc("report_news_card", {
      _news_id: id, _card_type: cardType, _reason: cardReason.trim(),
    });
    setReporting(false);
    if (error) {
      toast.error(error.message || "Không gửi được báo cáo.");
      return;
    }
    toast.success("Đã gửi báo cáo thẻ — chờ admin xác nhận.");
    setReportOpen(false);
    setCardReason("");
    setCardType("yellow");
  };
  
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
          {/* Tiêu đề đậm. Tin format mới (có nội dung): chữ nhỏ (text-sm).
              Responsive: mobile (<md) KHÔNG clamp để hiện trọn tiêu đề;
              desktop (≥md) line-clamp-2 cho tối đa 2 dòng (đủ chứa hầu hết
              tiêu đề mà vẫn gọn hàng — trước line-clamp-1 cắt cụt nhiều tin).
              Tin cũ (description trống, title chứa cả đoạn): giữ text-base. */}
          <p
            className={`font-semibold leading-relaxed ${
              description ? "text-sm md:line-clamp-2 mb-2.5" : "text-base mb-3"
            }`}
          >
            {title}
          </p>

          {/* Nội dung (≤140 từ theo guideline). Chỉ render khi có dữ liệu —
              tin cũ (description trống) hiển thị y như trước.
              Tách theo xuống dòng (Alt+Enter trong sheet) thành các đoạn
              riêng — trước đây 1 thẻ <p> khiến HTML gộp các dòng thành 1
              khối, mất cách đoạn. Lọc dòng rỗng để bỏ dòng trống thừa giữa
              2 đoạn. Tin chỉ 1 đoạn → vẫn render 1 <p>, không đổi. */}
          {description && (
            <div className="mb-3">
              {description
                .split(/\r?\n/)
                .map((para) => para.trim())
                .filter((para) => para.length > 0)
                .map((para, idx) => (
                  <p
                    key={idx}
                    className="text-sm text-muted-foreground leading-relaxed mb-2 last:mb-0"
                  >
                    {para}
                  </p>
                ))}
            </div>
          )}

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
              {showReport && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1 hover:bg-transparent text-muted-foreground hover:text-red-600"
                  title="Báo thẻ tin có vấn đề"
                  onClick={(e) => { e.stopPropagation(); setReportOpen(true); }}
                >
                  <Flag className="h-3.5 w-3.5" />
                </Button>
              )}
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
        shareUrl={shareUrl}
      />

      {/* Dialog báo thẻ vàng/đỏ — thẻ chỉ tính sau khi admin duyệt */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>🚩 Báo thẻ tin có vấn đề</DialogTitle>
            <DialogDescription className="line-clamp-2">{title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Mức đề xuất</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant={cardType === "yellow" ? "default" : "outline"}
                  className={cardType === "yellow" ? "bg-yellow-500 hover:bg-yellow-600 text-black" : ""}
                  onClick={() => setCardType("yellow")}>
                  🟨 Thẻ vàng (lỗi nhẹ)
                </Button>
                <Button type="button" variant={cardType === "red" ? "default" : "outline"}
                  className={cardType === "red" ? "bg-red-600 hover:bg-red-700" : ""}
                  onClick={() => setCardType("red")}>
                  🟥 Thẻ đỏ (lỗi nặng)
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Vàng: sai mục, văn phong, lặp ý. Đỏ: sai sự thật, PR trá hình, đạo văn.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Lý do (bắt buộc, ≥ 5 từ)</Label>
              <Textarea value={cardReason} onChange={(e) => setCardReason(e.target.value)} rows={3}
                placeholder="Nêu cụ thể tin sai ở điểm nào — admin sẽ đối chiếu trước khi tính thẻ..." />
            </div>
            <p className="text-xs text-muted-foreground">
              Thẻ sẽ được cả nhóm biểu quyết trên trang Bảng xếp hạng (ẩn danh người báo) — chênh 3 phiếu "chuẩn" thì thẻ được tính. Báo đúng thẻ đỏ được ghi nhận khen thưởng.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReportOpen(false)} disabled={reporting}>Huỷ</Button>
            <Button variant="destructive" onClick={submitReport} disabled={reporting}>
              {reporting ? "Đang gửi..." : "Gửi báo cáo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
