import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

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
  const [shouldHideReadNews, setShouldHideReadNews] = useState(false);
  const [news, setNews] = useState<any[]>([]);

  // Load read news and current index from localStorage on mount
  useEffect(() => {
    const loadFromStorage = () => {
      try {
        // Load read news
        const storedReadNews = localStorage.getItem('luot247_read_news');
        console.log('🔍 ReadingContext - Loading read news from localStorage:', storedReadNews);
        if (storedReadNews) {
          const readIds = JSON.parse(storedReadNews);
          setReadNewsIds(new Set(readIds));
          console.log('📚 ReadingContext - Loaded read news IDs:', readIds);
          
          // Set shouldHideReadNews if there are read news
          if (readIds.length > 0) {
            console.log('🚀 ReadingContext - Setting shouldHideReadNews = true');
            setShouldHideReadNews(true);
          }
        }

        // Load current index
        const storedIndex = localStorage.getItem('luot247_current_index');
        console.log('🔍 ReadingContext - Loading current index from localStorage:', storedIndex);
        if (storedIndex) {
          const index = parseInt(storedIndex);
          if (!isNaN(index)) {
            setCurrentNewsIndex(index);
            console.log('📚 ReadingContext - Loaded current index:', index);
          }
        }
      } catch (error) {
        console.error('❌ ReadingContext - Error loading from storage:', error);
      }
    };

    loadFromStorage();
  }, []);

  // Save read news to localStorage
  const saveReadNewsToStorage = (readIds: Set<string>) => {
    try {
      const idsArray = [...readIds];
      localStorage.setItem('luot247_read_news', JSON.stringify(idsArray));
      console.log('💾 ReadingContext - Saved read news to localStorage:', idsArray);
    } catch (error) {
      console.error('❌ ReadingContext - Error saving read news to storage:', error);
    }
  };

  // Save current index to localStorage
  const saveCurrentIndexToStorage = (index: number) => {
    try {
      localStorage.setItem('luot247_current_index', index.toString());
      console.log('💾 ReadingContext - Saved current index to localStorage:', index);
    } catch (error) {
      console.error('❌ ReadingContext - Error saving current index to storage:', error);
    }
  };

  // Mark news as read
  const markNewsAsRead = (newsId: string) => {
    console.log('📖 ReadingContext - Marking news as read:', newsId);
    setReadNewsIds(prev => {
      const newSet = new Set(prev);
      newSet.add(newsId);
      console.log('📖 ReadingContext - Updated read news set:', [...newSet]);
      saveReadNewsToStorage(newSet);
      return newSet;
    });
  };

  // Clear all read news
  const clearReadNews = () => {
    console.log('🔄 ReadingContext - Clearing all read news and current index');
    localStorage.removeItem('luot247_read_news');
    localStorage.removeItem('luot247_current_index');
    setReadNewsIds(new Set());
    setShouldHideReadNews(false);
    setCurrentNewsIndex(0);
    console.log('🔄 ReadingContext - Cleared all read news and reset index');
  };

  // Wrapper function to set current index and save to localStorage
  const updateCurrentNewsIndex = (index: number) => {
    setCurrentNewsIndex(index);
    saveCurrentIndexToStorage(index);
  };

  // Filter news based on read status
  const filteredNews = shouldHideReadNews
    ? news.filter(item => !readNewsIds.has(item.id))
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
  };

  return (
    <ReadingContext.Provider value={value}>
      {children}
    </ReadingContext.Provider>
  );
};
