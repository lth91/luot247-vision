import { useContext } from 'react';
import { ReadingContext } from './ReadingContext';

export const useReadingContext = () => {
  const context = useContext(ReadingContext);
  if (context === undefined) {
    throw new Error('useReadingContext must be used within a ReadingProvider');
  }
  return context;
};
