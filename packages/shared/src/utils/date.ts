/**
 * Date utility functions
 */

import {
  format,
  formatDistanceToNow,
  isToday,
  isTomorrow,
  isYesterday,
  isPast,
  isFuture,
  startOfDay,
  endOfDay,
  addDays,
  parseISO,
} from 'date-fns';
import { ko } from 'date-fns/locale';

/**
 * Format a date for display
 */
export function formatDate(date: string | Date, formatStr: string = 'PPP'): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return format(dateObj, formatStr, { locale: ko });
}

/**
 * Format a date relative to now (e.g., "2시간 전", "3일 후")
 */
export function formatRelativeDate(date: string | Date): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return formatDistanceToNow(dateObj, { addSuffix: true, locale: ko });
}

/**
 * Get a human-readable date label (e.g., "오늘", "내일", "어제")
 */
export function getDateLabel(date: string | Date): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;

  if (isToday(dateObj)) {
    return '오늘';
  }
  if (isTomorrow(dateObj)) {
    return '내일';
  }
  if (isYesterday(dateObj)) {
    return '어제';
  }

  return formatDate(dateObj, 'M월 d일');
}

/**
 * Check if a date is overdue (in the past and not today)
 */
export function isOverdue(date: string | Date): boolean {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return isPast(dateObj) && !isToday(dateObj);
}

/**
 * Check if a date is upcoming (in the future and not today)
 */
export function isUpcoming(date: string | Date): boolean {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return isFuture(dateObj) && !isToday(dateObj);
}

/**
 * Get today's date in ISO format (YYYY-MM-DD)
 */
export function getTodayISO(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

/**
 * Get tomorrow's date in ISO format (YYYY-MM-DD)
 */
export function getTomorrowISO(): string {
  return format(addDays(new Date(), 1), 'yyyy-MM-dd');
}

/**
 * Get start of day timestamp
 */
export function getStartOfDay(date: string | Date): Date {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return startOfDay(dateObj);
}

/**
 * Get end of day timestamp
 */
export function getEndOfDay(date: string | Date): Date {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return endOfDay(dateObj);
}

/**
 * Parse natural language date input (basic version, no AI)
 * Examples: "오늘", "내일", "다음주 월요일"
 */
export function parseNaturalDate(input: string): Date | null {
  const normalized = input.trim().toLowerCase();

  // Today
  if (normalized === '오늘' || normalized === 'today') {
    return new Date();
  }

  // Tomorrow
  if (normalized === '내일' || normalized === 'tomorrow') {
    return addDays(new Date(), 1);
  }

  // This is a simplified version
  // In production, you'd use a library like chrono-node or build a more robust parser
  return null;
}

/**
 * Format duration in milliseconds to human readable string
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}일`;
  }
  if (hours > 0) {
    return `${hours}시간`;
  }
  if (minutes > 0) {
    return `${minutes}분`;
  }
  return `${seconds}초`;
}
