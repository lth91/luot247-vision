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
 * Calculates based on GMT+7 (Vietnam timezone)
 */
export const getRelativeTime = (timestamp: string | Date): string => {
  // Parse the timestamp from database (UTC)
  let created: Date;
  if (typeof timestamp === 'string') {
    // Database timestamps are in UTC
    const utcTimestamp = timestamp.endsWith('Z') || timestamp.includes('+') || timestamp.includes('-', 10) 
      ? timestamp 
      : timestamp + 'Z';
    created = new Date(utcTimestamp);
  } else {
    created = timestamp;
  }
  
  // Get current time in UTC
  const now = new Date();
  
  // Calculate difference in milliseconds (both UTC)
  const diffMs = now.getTime() - created.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return "Vừa xong";
  if (diffMinutes < 60) return `${diffMinutes} phút trước`;
  if (diffHours < 24) return `${diffHours} giờ trước`;
  if (diffDays < 30) return `${diffDays} ngày trước`;
  
  // For dates older than 30 days, format with GMT+7 timezone
  return formatVietnamDateShort(timestamp);
};
