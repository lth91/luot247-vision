import React, { createContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface FavoritesContextType {
  favoriteIds: Set<string>;
  favoriteData: Array<{news_id: string, created_at: string}>;
  isLoading: boolean;
  toggleFavorite: (newsId: string) => Promise<void>;
  isFavorite: (newsId: string) => boolean;
  loadFavorites: () => Promise<void>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);

interface FavoritesProviderProps {
  children: ReactNode;
  userId?: string;
}

export const FavoritesProvider: React.FC<FavoritesProviderProps> = ({ children, userId }) => {
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [favoriteData, setFavoriteData] = useState<Array<{news_id: string, created_at: string}>>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadFavorites = useCallback(async () => {
    if (!userId) {
      setFavoriteIds(new Set());
      setFavoriteData([]);
      return;
    }

    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('favorites')
        .select('news_id, created_at')
        .eq('user_id', userId);

      if (error) throw error;

      const ids = new Set(data?.map(item => item.news_id) || []);
      setFavoriteIds(ids);
      setFavoriteData(data || []);
    } catch (error) {
      console.error('Error loading favorites:', error);
      toast.error('Không thể tải danh sách yêu thích');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  const toggleFavorite = async (newsId: string) => {
    if (!userId) {
      toast.error('Vui lòng đăng nhập để sử dụng tính năng này');
      return;
    }

    const isCurrentlyFavorite = favoriteIds.has(newsId);

    try {
      if (isCurrentlyFavorite) {
        // Remove from favorites
        const { error } = await supabase
          .from('favorites')
          .delete()
          .eq('user_id', userId)
          .eq('news_id', newsId);

        if (error) throw error;

        setFavoriteIds(prev => {
          const updated = new Set(prev);
          updated.delete(newsId);
          return updated;
        });

        setFavoriteData(prev => prev.filter(item => item.news_id !== newsId));
        toast.success('Đã xóa khỏi danh sách yêu thích');
      } else {
        // Add to favorites
        const { error } = await supabase
          .from('favorites')
          .insert({ user_id: userId, news_id: newsId });

        if (error && !error.message.includes('duplicate')) {
          throw error;
        }

        setFavoriteIds(prev => new Set([...prev, newsId]));

        // Add to favoriteData with current timestamp
        const newFavoriteData = {
          news_id: newsId,
          created_at: new Date().toISOString()
        };
        setFavoriteData(prev => [...prev, newFavoriteData]);
        toast.success('Đã thêm vào danh sách yêu thích');
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
      toast.error('Có lỗi xảy ra khi cập nhật danh sách yêu thích');
    }
  };

  const isFavorite = (newsId: string): boolean => {
    return favoriteIds.has(newsId);
  };

  // Load favorites when userId changes
  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  const value: FavoritesContextType = {
    favoriteIds,
    favoriteData,
    isLoading,
    toggleFavorite,
    isFavorite,
    loadFavorites,
  };

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
};
