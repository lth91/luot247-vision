import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MessageCircle, Facebook, Twitter, Mail, Copy } from "lucide-react";
import { toast } from "sonner";

interface ShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  newsId: string;
  newsTitle: string;
}

export const ShareDialog = ({ isOpen, onClose, newsId, newsTitle }: ShareDialogProps) => {
  const shareUrl = `${window.location.origin}/?news=${newsId}`;
  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedTitle = encodeURIComponent(newsTitle);

  const handleWhatsApp = () => {
    const whatsappUrl = `https://wa.me/?text=${encodedTitle}%0A${encodedUrl}`;
    window.open(whatsappUrl, '_blank');
  };

  const handleFacebook = () => {
    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
    window.open(facebookUrl, '_blank');
  };

  const handleTwitter = () => {
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`;
    window.open(twitterUrl, '_blank');
  };

  const handleEmail = () => {
    const emailUrl = `mailto:?subject=${encodedTitle}&body=${encodedUrl}`;
    window.location.href = emailUrl;
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    toast.success("Đã sao chép liên kết");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Chia sẻ tin tức</DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-col gap-3 py-4">
          <Button
            variant="outline"
            className="justify-start gap-3 h-12"
            onClick={handleWhatsApp}
          >
            <MessageCircle className="h-5 w-5 text-green-600" />
            <span>WhatsApp</span>
          </Button>

          <Button
            variant="outline"
            className="justify-start gap-3 h-12"
            onClick={handleFacebook}
          >
            <Facebook className="h-5 w-5 text-blue-600" />
            <span>Facebook</span>
          </Button>

          <Button
            variant="outline"
            className="justify-start gap-3 h-12"
            onClick={handleTwitter}
          >
            <Twitter className="h-5 w-5 text-sky-500" />
            <span>X (Twitter)</span>
          </Button>

          <Button
            variant="outline"
            className="justify-start gap-3 h-12"
            onClick={handleEmail}
          >
            <Mail className="h-5 w-5 text-red-600" />
            <span>Email</span>
          </Button>

          <div className="border-t pt-3 mt-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={shareUrl}
                readOnly
                className="flex-1 px-3 py-2 text-sm border rounded-md bg-muted"
              />
              <Button
                variant="default"
                size="sm"
                onClick={handleCopy}
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
