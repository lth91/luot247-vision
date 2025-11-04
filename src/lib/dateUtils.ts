/**
 * Format timestamp to Vietnam timezone (GMT+7)
 */

/**
 * Convert UTC timestamp to Vietnam timezone and return Date object
 */
export const toVietnamTime = (utcTimestamp: string | Date): Date => {
  const date = typeof utcTimestamp === 'string' ? new Date(utcTimestamp) : utcTimestamp;
  // Add 7 hours for GMT+7
  return new Date(date.getTime() + (7 * 60 * 60 * 1000));
};

/**
 * Format timestamp to Vietnamese locale string
 */
export const formatVietnamDate = (timestamp: string | Date): string => {
  const vnDate = toVietnamTime(timestamp);
  return vnDate.toLocaleDateString("vi-VN", {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Format timestamp to short Vietnamese date (no time)
 */
export const formatVietnamDateShort = (timestamp: string | Date): string => {
  const vnDate = toVietnamTime(timestamp);
  return vnDate.toLocaleDateString("vi-VN");
};

/**
 * Get relative time in Vietnamese (e.g., "2 giờ trước")
 */
export const getRelativeTime = (timestamp: string | Date): string => {
  const now = new Date();
  const created = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  const diffMs = now.getTime() - created.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return "Vừa xong";
  if (diffMinutes < 60) return `${diffMinutes} phút trước`;
  if (diffHours < 24) return `${diffHours} giờ trước`;
  if (diffDays < 30) return `${diffDays} ngày trước`;
  
  return formatVietnamDateShort(timestamp);
};
