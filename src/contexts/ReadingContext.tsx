import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// Logger chỉ chạy ở dev; production im lặng. markNewsAsRead + save chạy mỗi lần
// scroll đánh dấu đọc → log ở đây góp phần gây giật. Gate qua import.meta.env.DEV.
const dbg: (...args: unknown[]) => void = import.meta.env.DEV ? console.log : () => {};

interface ReadingContextType {
  // Current reading position
  currentNewsIndex: number;
  setCurrentNewsIndex: (index: number) => void;

  // Read news tracking
  readNewsIds: Set<string>;
  markNewsAsRead: (newsId: string) => void;
  clearReadNews: () => void;

  // Hide read news state
  shouldHideReadNews: boolean;
  setShouldHideReadNews: (hide: boolean) => void;

  // News data
  news: any[];
  setNews: (news: any[]) => void;

  // Filtered news (excluding read ones if shouldHideReadNews is true)
  filteredNews: any[];

  // Current news based on index
  currentNews: any | null;

  // Highlight effect for sync
  highlightedNewsId: string | null;
  setHighlightedNewsId: (newsId: string | null) => void;

  // Mode synchronization
  syncToFlipMode: () => void;
  syncToScrollMode: () => void;

  // Deep link handling
  isFromSharedLink: boolean;
  setIsFromSharedLink: (value: boolean) => void;

  // Electricity news (/d) — separate tracking. Cùng pattern UX với news
  // (auto-hide khi mark first, persist localStorage, clear all) nhưng key
  // riêng để 2 luồng không đụng nhau.
  readElectricityNewsIds: Set<string>;
  markElectricityNewsAsRead: (id: string) => void;
  clearReadElectricityNews: () => void;
  shouldHideReadElectricityNews: boolean;
  setShouldHideReadElectricityNews: (hide: boolean) => void;
}

const ReadingContext = createContext<ReadingContextType | undefined>(undefined);

export const useReadingContext = () => {
  const context = useContext(ReadingContext);
  if (context === undefined) {
    throw new Error('useReadingContext must be used within a ReadingProvider');
  }
  return context;
};

interface ReadingProviderProps {
  children: ReactNode;
}

export const ReadingProvider: React.FC<ReadingProviderProps> = ({ children }) => {
  const [currentNewsIndex, setCurrentNewsIndex] = useState(0);
  const [readNewsIds, setReadNewsIds] = useState<Set<string>>(new Set());
  // Snapshot read-ids tại lúc mount. Filter chỉ dùng snapshot này nên các tin
  // mark-read TRONG SESSION (scroll qua) KHÔNG biến mất ngay → hết giật.
  // Tin chỉ ẩn ở lần reload sau khi snapshot refresh từ localStorage.
  const [readNewsIdsAtMount, setReadNewsIdsAtMount] = useState<Set<string>>(new Set());
  const [shouldHideReadNews, setShouldHideReadNews] = useState(false);
  const [news, setNews] = useState<any[]>([]);
  const [highlightedNewsId, setHighlightedNewsId] = useState<string | null>(null);
  const [isFromSharedLink, setIsFromSharedLink] = useState(false);

  // Electricity-news tracking (separate state, separate localStorage key)
  const [readElectricityNewsIds, setReadElectricityNewsIds] = useState<Set<string>>(new Set());
  const [shouldHideReadElectricityNews, setShouldHideReadElectricityNews] = useState(false);

  // Load read news and current index from localStorage on mount
  useEffect(() => {
    const loadFromStorage = () => {
      try {
        // Load read news
        const storedReadNews = localStorage.getItem('luot247_read_news');
        dbg('🔍 ReadingContext - Loading read news from localStorage:', storedReadNews);
        if (storedReadNews) {
          const readIds = JSON.parse(storedReadNews);
          const idsSet = new Set<string>(readIds);
          setReadNewsIds(idsSet);
          // Snapshot ID đã đọc tại mount → filter cố định trong session.
          setReadNewsIdsAtMount(idsSet);
          dbg('📚 ReadingContext - Loaded read news IDs:', readIds);

          // Set shouldHideReadNews if there are read news
          if (readIds.length > 0) {
            dbg('🚀 ReadingContext - Setting shouldHideReadNews = true');
            setShouldHideReadNews(true);
          }
        }

        // Load current index
        const storedIndex = localStorage.getItem('luot247_current_index');
        dbg('🔍 ReadingContext - Loading current index from localStorage:', storedIndex);
        if (storedIndex) {
          const index = parseInt(storedIndex);
          if (!isNaN(index)) {
            setCurrentNewsIndex(index);
            dbg('📚 ReadingContext - Loaded current index:', index);
          }
        }
      } catch (error) {
        console.error('❌ ReadingContext - Error loading from storage:', error);
      }
    };

    loadFromStorage();
  }, []);

  // Load read electricity_news from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('luot247_read_electricity_news');
      if (stored) {
        const ids = JSON.parse(stored) as string[];
        setReadElectricityNewsIds(new Set(ids));
        if (ids.length > 0) setShouldHideReadElectricityNews(true);
      }
    } catch (e) {
      console.error('ReadingContext - load read_electricity_news error:', e);
    }
  }, []);

  // Save read news to localStorage
  const saveReadNewsToStorage = (readIds: Set<string>) => {
    try {
      const idsArray = [...readIds];
      localStorage.setItem('luot247_read_news', JSON.stringify(idsArray));
      dbg('💾 ReadingContext - Saved read news to localStorage:', idsArray);
    } catch (error) {
      console.error('❌ ReadingContext - Error saving read news to storage:', error);
    }
  };

  // Save current index to localStorage
  const saveCurrentIndexToStorage = (index: number) => {
    try {
      localStorage.setItem('luot247_current_index', index.toString());
      dbg('💾 ReadingContext - Saved current index to localStorage:', index);
    } catch (error) {
      console.error('❌ ReadingContext - Error saving current index to storage:', error);
    }
  };

  // Mark news as read
  const markNewsAsRead = (newsId: string) => {
    // Don't mark as read if user came from shared link
    if (isFromSharedLink) {
      dbg('🔗 ReadingContext - Skipping mark as read (from shared link)');
      return;
    }
    
    dbg('📖 ReadingContext - Marking news as read:', newsId);
    setReadNewsIds(prev => {
      if (prev.has(newsId)) return prev;
      const newSet = new Set(prev);
      newSet.add(newsId);
      dbg('📖 ReadingContext - Updated read news set size:', newSet.size);
      saveReadNewsToStorage(newSet);

      // QUAN TRỌNG: KHÔNG tự bật shouldHideReadNews ở đây nữa. Trước đây
      // bật ngay → filteredNews (xưa dùng readNewsIds live) recompute →
      // tin biến mất khỏi DOM → trang nhảy giật. Giờ filter dùng snapshot
      // readNewsIdsAtMount cố định trong session, chỉ ẩn ở reload sau.
      // Lúc mount, nếu localStorage có read-ids thì effect load đã tự bật
      // shouldHideReadNews=true rồi.
      return newSet;
    });
  };

  // Clear all read news
  const clearReadNews = () => {
    dbg('🔄 ReadingContext - Clearing all read news and current index');
    localStorage.removeItem('luot247_read_news');
    localStorage.removeItem('luot247_current_index');
    setReadNewsIds(new Set());
    // Reset snapshot luôn → filter ngay lập tức cho hiện tất cả tin trở lại
    // (đây là behavior người dùng kỳ vọng khi bấm "Hiển thị tất cả tin đã đọc").
    setReadNewsIdsAtMount(new Set());
    setShouldHideReadNews(false);
    setCurrentNewsIndex(0);
    dbg('🔄 ReadingContext - Cleared all read news and reset index');
  };

  // Wrapper function to set current index and save to localStorage
  const updateCurrentNewsIndex = (index: number) => {
    setCurrentNewsIndex(index);
    saveCurrentIndexToStorage(index);
  };

  // Filter dựa trên SNAPSHOT readNewsIdsAtMount (không phải readNewsIds live)
  // → mark-read mới trong session KHÔNG khiến tin biến mất khỏi DOM → hết giật.
  // Tin chỉ ẩn ở lần tải lại trang sau khi snapshot refresh từ localStorage.
  const filteredNews = (shouldHideReadNews && !isFromSharedLink)
    ? news.filter(item => !readNewsIdsAtMount.has(item.id))
    : news;

  // Get current news based on index
  const currentNews = filteredNews[currentNewsIndex] || null;

  // Sync current index when news changes or filtering changes
  useEffect(() => {
    if (filteredNews.length > 0 && currentNewsIndex >= filteredNews.length) {
      // If current index is out of bounds, reset to 0
      updateCurrentNewsIndex(0);
    }
  }, [filteredNews.length, currentNewsIndex]);

  // Sync to Flip mode: Find the first unread news or current position
  const syncToFlipMode = () => {
    dbg('🔄 Syncing to Flip mode...');
    
    if (filteredNews.length === 0) {
      dbg('📰 No filtered news available');
      return;
    }

    // Detect if user is on mobile
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
    
    if (isMobile) {
      dbg('📱 Mobile detected for Flip mode sync');
      
      // On mobile, try to find the news that was last visible in scroll mode
      const lastVisibleNewsId = localStorage.getItem('luot247_last_visible_news');
      if (lastVisibleNewsId) {
        const newsIndex = filteredNews.findIndex(item => item.id === lastVisibleNewsId);
        if (newsIndex !== -1) {
          dbg(`📱 Mobile: Found last visible news at index ${newsIndex}`);
          updateCurrentNewsIndex(newsIndex);
          return;
        }
      }
    }

    // Sau PR snapshot-filter (#44): danh sách hiển thị lọc theo
    // readNewsIdsAtMount (snapshot), nhưng trước đây flip mode lại tìm
    // "tin chưa đọc đầu tiên" theo readNewsIds (LIVE) → lệch nhau. Tin vừa
    // lướt-đọc trong session vẫn hiện ở trang chủ (snapshot cố định) nhưng
    // flip mode nhảy qua chúng → mở sai tin (không khớp tin đầu feed).
    // Giờ flip mode bám theo vị trí đang xem (currentNewsIndex — desktop sync
    // theo scroll, mobile đã xử lý bằng last_visible_news ở trên) để luôn
    // khớp với tin người dùng đang nhìn ở trang chủ.
    if (currentNewsIndex >= 0 && currentNewsIndex < filteredNews.length) {
      dbg(`📰 Flip mode: giữ vị trí đang xem index ${currentNewsIndex}`);
    } else {
      dbg('📰 Flip mode: index ngoài phạm vi, về đầu list (0)');
      updateCurrentNewsIndex(0);
    }
  };

  // Sync to Scroll mode: Scroll to the current news being viewed in Flip mode
  const syncToScrollMode = () => {
    dbg('🔄 Syncing to Scroll mode...');
    dbg('📊 Sync debug info:', {
      currentNewsIndex: currentNewsIndex,
      filteredNewsLength: filteredNews.length,
      currentNews: currentNews,
      currentNewsId: currentNews?.id
    });
    
    if (currentNews && typeof window !== 'undefined') {
      // Set highlight for the current news
      setHighlightedNewsId(currentNews.id);
      dbg(`✨ Highlighting news ${currentNews.id}`);
      
      // Detect if user is on mobile
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
      
      // More robust scroll function with multiple retries
      const scrollToElement = (attempt = 1) => {
        const newsElement = document.querySelector(`[data-news-id="${currentNews.id}"]`);
        if (newsElement) {
          dbg(`📰 Found news element ${currentNews.id} (attempt ${attempt})`);
          
          // Calculate position to place element at top of viewport
          const elementRect = newsElement.getBoundingClientRect();
          const headerHeight = 60; // Approximate header height
          const currentScrollTop = window.pageYOffset;
          const targetScrollTop = currentScrollTop + elementRect.top - headerHeight;
          
          // Immediate scroll to position (no smooth behavior for reliability)
          window.scrollTo(0, Math.max(0, targetScrollTop));
          
          dbg(`📰 Scrolled to position: ${targetScrollTop}`);
          
          // On mobile, also save this as the last visible news
          if (isMobile) {
            localStorage.setItem('luot247_last_visible_news', currentNews.id);
            dbg(`📱 Mobile: Saved ${currentNews.id} as last visible news`);
          }
          
          return true; // Success
        } else {
          dbg(`📰 News element not found for ${currentNews.id} (attempt ${attempt})`);
          return false; // Failed
        }
      };
      
      // Try multiple times with increasing delays - longer delays for mobile
      const baseDelay = isMobile ? 200 : 100;
      const tryScroll = () => {
        if (!scrollToElement()) {
          // Retry with exponential backoff
          setTimeout(() => {
            if (!scrollToElement()) {
              setTimeout(() => {
                if (!scrollToElement()) {
                  dbg(`📰 Final attempt failed for ${currentNews.id}, scrolling to top`);
                  window.scrollTo(0, 0);
                }
              }, baseDelay * 2);
            }
          }, baseDelay);
        }
      };
      
      // Start trying immediately
      tryScroll();
      
      // Remove highlight after 3 seconds
      setTimeout(() => {
        setHighlightedNewsId(null);
        dbg(`✨ Removed highlight from news ${currentNews.id}`);
      }, 3000);
    } else {
      dbg('📰 No current news or not in browser, scrolling to top');
      dbg('📊 Fallback debug info:', {
        currentNews: currentNews,
        currentNewsIndex: currentNewsIndex,
        filteredNewsLength: filteredNews.length,
        windowAvailable: typeof window !== 'undefined'
      });
      if (typeof window !== 'undefined') {
        window.scrollTo(0, 0);
      }
    }
  };

  // Electricity-news mark/clear handlers — auto-enable hide giống news flow.
  // Page-level useLayoutEffect compensate scrollY khi card collapse (mobile
  // Safari thiếu scroll-anchor — manual fix).
  const markElectricityNewsAsRead = (id: string) => {
    setReadElectricityNewsIds(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      try {
        localStorage.setItem('luot247_read_electricity_news', JSON.stringify([...next]));
      } catch (e) {
        console.error('save read_electricity_news error:', e);
      }
      if (!shouldHideReadElectricityNews) setShouldHideReadElectricityNews(true);
      return next;
    });
  };

  const clearReadElectricityNews = () => {
    localStorage.removeItem('luot247_read_electricity_news');
    setReadElectricityNewsIds(new Set());
    setShouldHideReadElectricityNews(false);
  };

  const value: ReadingContextType = {
    currentNewsIndex,
    setCurrentNewsIndex: updateCurrentNewsIndex,
    readNewsIds,
    markNewsAsRead,
    clearReadNews,
    shouldHideReadNews,
    setShouldHideReadNews,
    news,
    setNews,
    filteredNews,
    currentNews,
    highlightedNewsId,
    setHighlightedNewsId,
    syncToFlipMode,
    syncToScrollMode,
    isFromSharedLink,
    setIsFromSharedLink,
    readElectricityNewsIds,
    markElectricityNewsAsRead,
    clearReadElectricityNews,
    shouldHideReadElectricityNews,
    setShouldHideReadElectricityNews,
  };

  return (
    <ReadingContext.Provider value={value}>
      {children}
    </ReadingContext.Provider>
  );
};
