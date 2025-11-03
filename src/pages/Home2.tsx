import { useEffect, useState, useRef } from "react";
import { Header } from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ThumbsUp, ThumbsDown, Share2, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useReadingContext } from "@/contexts/ReadingContext";
import { useFavorites } from "@/contexts/FavoritesContext";
import { ShareDialog } from "@/components/ShareDialog";
import { getRelativeTime } from "@/lib/dateUtils";

const Home2 = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [disliked, setDisliked] = useState(false);
  const [showArrows, setShowArrows] = useState(false);
  const [hasShownHints, setHasShownHints] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const mainContentRef = useRef<HTMLDivElement>(null);

  // Use ReadingContext
  const {
    news,
    setNews,
    filteredNews,
    currentNewsIndex,
    setCurrentNewsIndex,
    markNewsAsRead,
    clearReadNews,
    currentNews
  } = useReadingContext();
  
  // Use FavoritesContext
  const { isFavorite, toggleFavorite } = useFavorites();
  const liked = currentNews ? isFavorite(currentNews.id) : false;

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user) {
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .maybeSingle()
        .then(({ data }) => {
          setUserRole(data?.role || null);
        });
    } else {
      setUserRole(null);
    }
  }, [session]);

  useEffect(() => {
    fetchNews();
    
    // Check if hints have been shown before
    const hintsShown = localStorage.getItem('luot247_flip_mode_hints_shown');
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
    
    if (isMobile && !hintsShown) {
      console.log('📱 Mobile: First time entering Flip mode, showing hints');
      setShowArrows(true);
      setHasShownHints(true);
      
      // Hide arrows after 2 seconds
      const hideArrowsTimer = setTimeout(() => {
        setShowArrows(false);
        // Mark hints as shown in localStorage
        localStorage.setItem('luot247_flip_mode_hints_shown', 'true');
        console.log('📱 Mobile: Hints hidden and marked as shown');
      }, 2000);
      
      return () => clearTimeout(hideArrowsTimer);
    } else if (isMobile && hintsShown) {
      console.log('📱 Mobile: Hints already shown before, not showing again');
      setHasShownHints(true);
    }
  }, []);

  // Setup touch navigation immediately on mount - Mobile only
  useEffect(() => {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
    
    if (!isMobile) {
      return;
    }
    
    console.log('📱 Mobile: Setting up immediate touch navigation');
    
    const handleTouchEnd = (event: TouchEvent) => {
      if (event.touches.length > 0) return;
      
      // Only show arrows if hints haven't been shown before
      const hintsShown = localStorage.getItem('luot247_flip_mode_hints_shown');
      if (!hintsShown) {
        setShowArrows(true);
        setTimeout(() => {
          setShowArrows(false);
        }, 2000);
      }
      
      const touch = event.changedTouches[0];
      const touchX = touch.clientX;
      const screenWidth = window.innerWidth;
      
      console.log('📱 Immediate touch detected:', {
        touchX: touchX,
        screenWidth: screenWidth,
        leftHalf: touchX < screenWidth / 2,
        hintsShown: !!hintsShown
      });
      
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }
      
      if (touchX < screenWidth / 2) {
        console.log('📱 Touch on left half - going to previous news');
        handlePrevious();
      } else {
        console.log('📱 Touch on right half - going to next news');
        handleNext();
      }
    };

    // Try to setup immediately with multiple retries
    const setupTouchListener = () => {
      const mainContent = mainContentRef.current;
      if (mainContent) {
        console.log('📱 Mobile: Adding immediate touch listener');
        mainContent.addEventListener('touchend', handleTouchEnd, { passive: true });
        return true;
      }
      return false;
    };

    // Try immediately
    if (!setupTouchListener()) {
      // If not available, try multiple times with increasing delays
      const retryDelays = [100, 300, 500, 1000];
      let retryIndex = 0;
      
      const retrySetup = () => {
        if (retryIndex < retryDelays.length) {
          setTimeout(() => {
            if (!setupTouchListener()) {
              retryIndex++;
              retrySetup();
            }
          }, retryDelays[retryIndex]);
        }
      };
      
      retrySetup();
    }
  }, []);

  const fetchNews = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("news")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Không thể tải tin tức");
      console.error(error);
    } else {
      setNews(data || []);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        handleNext();
      } else if (event.key === "ArrowLeft") {
        handlePrevious();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentNewsIndex, filteredNews.length]);

  // Touch gesture handling for mobile navigation - Mobile only (backup)
  useEffect(() => {
    // Only add touch listeners on mobile
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
    
    if (!isMobile) {
      console.log('🖥️ Desktop detected: Skipping touch navigation setup');
      return;
    }
    
    console.log('📱 Mobile detected: Setting up backup touch navigation');
    
    const handleTouchEnd = (event: TouchEvent) => {
      // Only process single touch (not multi-touch)
      if (event.touches.length > 0) return;
      
      // Only show arrows if hints haven't been shown before
      const hintsShown = localStorage.getItem('luot247_flip_mode_hints_shown');
      if (!hintsShown) {
        setShowArrows(true);
        setTimeout(() => {
          setShowArrows(false);
        }, 2000);
      }
      
      const touch = event.changedTouches[0];
      const touchX = touch.clientX;
      const screenWidth = window.innerWidth;
      
      console.log('📱 Backup touch detected:', {
        touchX: touchX,
        screenWidth: screenWidth,
        leftHalf: touchX < screenWidth / 2,
        hintsShown: !!hintsShown
      });
      
      // Add haptic feedback for mobile
      if ('vibrate' in navigator) {
        navigator.vibrate(50); // Short vibration
      }
      
      // Check if touch was in left or right half of screen
      if (touchX < screenWidth / 2) {
        // Left half - go to previous news
        console.log('📱 Backup touch on left half - going to previous news');
        handlePrevious();
      } else {
        // Right half - go to next news
        console.log('📱 Backup touch on right half - going to next news');
        handleNext();
      }
    };

    // Add touchend listener to main content area
    const mainContent = mainContentRef.current;
    if (mainContent) {
      console.log('📱 Adding backup touch event listener to main content');
      mainContent.addEventListener('touchend', handleTouchEnd, { passive: true });
      
      return () => {
        console.log('📱 Removing backup touch event listener');
        mainContent.removeEventListener('touchend', handleTouchEnd);
      };
    } else {
      console.log('📱 Main content ref not available for backup setup');
    }
  }, [currentNewsIndex, filteredNews.length]);

  const handleNext = () => {
    if (currentNewsIndex < filteredNews.length - 1) {
      // Mark current news as read before moving to next
      if (currentNews) {
        markNewsAsRead(currentNews.id);
      }
      
      const newIndex = currentNewsIndex + 1;
      setCurrentNewsIndex(newIndex);
      setDisliked(false);
      
      // Save the NEW current news as last visible for mobile sync
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
      if (isMobile && filteredNews[newIndex]) {
        localStorage.setItem('luot247_last_visible_news', filteredNews[newIndex].id);
        console.log(`📱 Mobile: Saved ${filteredNews[newIndex].id} as last visible news (next)`);
      }
    }
  };

  const handlePrevious = () => {
    if (currentNewsIndex > 0) {
      const newIndex = currentNewsIndex - 1;
      setCurrentNewsIndex(newIndex);
      setDisliked(false);
      
      // Save the NEW current news as last visible for mobile sync
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
      if (isMobile && filteredNews[newIndex]) {
        localStorage.setItem('luot247_last_visible_news', filteredNews[newIndex].id);
        console.log(`📱 Mobile: Saved ${filteredNews[newIndex].id} as last visible news (previous)`);
      }
    }
  };

  const handleLike = async () => {
    if (!session) {
      toast.error("Vui lòng đăng nhập");
      return;
    }

    if (!currentNews) return;

    await toggleFavorite(currentNews.id);
    setDisliked(false); // Clear dislike when liking
  };

  const handleDislike = () => {
    if (!session) {
      toast.error("Vui lòng đăng nhập");
      return;
    }
    
    setDisliked(!disliked);
    
    // If disliking and currently liked, remove from favorites
    if (!disliked && liked && currentNews) {
      toggleFavorite(currentNews.id);
    }
  };

  const handleShare = async () => {
    if (!currentNews) return;
    setShareDialogOpen(true);
  };

  const handleSearch = () => {
    if (!currentNews) return;
    const searchQuery = encodeURIComponent(currentNews.title);
    const googleSearchUrl = `https://www.google.com/search?q=${searchQuery}`;
    window.open(googleSearchUrl, '_blank', 'width=800,height=600');
  };

  const timeAgo = () => {
    if (!currentNews) return "";
    return getRelativeTime(currentNews.created_at);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header 
        user={session?.user} 
        userRole={userRole}
        onToggleReadNews={() => {
          clearReadNews();
        }}
      />

      <main className="flex-1 w-full max-w-4xl mx-auto px-4" style={{ paddingTop: '10px', paddingBottom: '10px' }}>
        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Đang tải tin tức...</p>
          </div>
        ) : filteredNews.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Không có tin tức nào</p>
          </div>
        ) : currentNews ? (
          <div className="h-full flip-mode-content relative" ref={mainContentRef}>
            {/* Beautiful arrow indicators - Mobile only */}
            {/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768 ? (
              <div className={`absolute inset-0 z-10 pointer-events-none transition-opacity duration-300 ${showArrows ? 'opacity-100' : 'opacity-0'}`}>
                {/* Left arrow */}
                <div className="absolute left-4 top-1/2 transform -translate-y-1/2">
                  <div className="bg-primary/20 backdrop-blur-sm rounded-full p-3 shadow-lg">
                    <ChevronLeft className="h-6 w-6 text-primary" />
                  </div>
                </div>
                
                {/* Right arrow */}
                <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
                  <div className="bg-primary/20 backdrop-blur-sm rounded-full p-3 shadow-lg">
                    <ChevronRight className="h-6 w-6 text-primary" />
                  </div>
                </div>
                
                {/* Navigation hint */}
                <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2">
                  <div className="bg-black/80 text-white px-4 py-2 rounded-lg text-sm backdrop-blur-sm">
                    Chạm vào nửa màn hình để điều hướng
                  </div>
                </div>
              </div>
            ) : null}
            
            {/* Main content area - fixed height */}
            <div className="bg-card rounded-lg border flex flex-col relative" style={{ height: 'calc(100vh - 76px)' }}>
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 lg:p-12">
                <h1 className="text-lg sm:text-xl md:text-2xl lg:text-3xl xl:text-4xl font-bold leading-relaxed mb-4 sm:mb-6 md:mb-8 text-gray-700">
                  {currentNews.title}
                </h1>
                {currentNews.description && (
                  <p className="text-gray-600 text-sm sm:text-base md:text-lg lg:text-xl leading-relaxed">
                    {currentNews.description}
                  </p>
                )}
              </div>

              {/* Action buttons and timestamp - pinned to bottom */}
              <div className="p-3 sm:p-4 md:p-6 bg-card">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 sm:gap-2">
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

                  <span className="text-xs sm:text-sm text-muted-foreground">
                    {timeAgo()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Không có tin tức để hiển thị</p>
          </div>
        )}
      </main>

      {currentNews && (
        <ShareDialog
          isOpen={shareDialogOpen}
          onClose={() => setShareDialogOpen(false)}
          newsId={currentNews.id}
          newsTitle={currentNews.title}
        />
      )}
    </div>
  );
};

export default Home2;
