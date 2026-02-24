/**
 * Recurrence rule utilities
 */

import { add, parseISO } from 'date-fns';
import { RecurrenceRule } from '../types';

/**
 * Calculate the next occurrence date based on a recurrence rule
 */
export function calculateNextOccurrence(
  currentDate: string | Date,
  rule: RecurrenceRule
): Date {
  const date = typeof currentDate === 'string' ? parseISO(currentDate) : currentDate;
  const { freq, interval = 1 } = rule;

  switch (freq) {
    case 'daily':
      return add(date, { days: interval });

    case 'weekly':
      return add(date, { weeks: interval });

    case 'monthly':
      if (rule.bymonthday) {
        // Recur on specific day of month
        const nextMonth = add(date, { months: interval });
        nextMonth.setDate(rule.bymonthday);
        return nextMonth;
      }
      return add(date, { months: interval });

    case 'yearly':
      return add(date, { years: interval });

    default:
      return add(date, { days: 1 });
  }
}

/**
 * Check if a recurrence rule should continue (based on 'until' date)
 */
export function shouldContinueRecurrence(
  nextDate: Date,
  rule: RecurrenceRule
): boolean {
  if (!rule.until) {
    return true;
  }

  const untilDate = parseISO(rule.until);
  return nextDate <= untilDate;
}

/**
 * Get a human-readable description of a recurrence rule
 */
export function describeRecurrenceRule(rule: RecurrenceRule): string {
  const { freq, interval = 1, until } = rule;

  let description = '';

  // Frequency
  switch (freq) {
    case 'daily':
      description = interval === 1 ? '매일' : `${interval}일마다`;
      break;
    case 'weekly':
      description = interval === 1 ? '매주' : `${interval}주마다`;
      break;
    case 'monthly':
      description = interval === 1 ? '매월' : `${interval}개월마다`;
      break;
    case 'yearly':
      description = interval === 1 ? '매년' : `${interval}년마다`;
      break;
  }

  // Until
  if (until) {
    const untilDate = parseISO(until);
    description += ` (${untilDate.toLocaleDateString('ko-KR')}까지)`;
  }

  return description;
}

/**
 * Create a basic recurrence rule from frequency
 */
export function createRecurrenceRule(
  freq: RecurrenceRule['freq'],
  interval: number = 1,
  until?: string
): RecurrenceRule {
  return {
    freq,
    interval,
    ...(until && { until }),
  };
}

/**
 * Validate a recurrence rule
 */
export function isValidRecurrenceRule(rule: any): rule is RecurrenceRule {
  if (!rule || typeof rule !== 'object') {
    return false;
  }

  const validFreqs = ['daily', 'weekly', 'monthly', 'yearly'];
  if (!validFreqs.includes(rule.freq)) {
    return false;
  }

  if (rule.interval !== undefined && (typeof rule.interval !== 'number' || rule.interval < 1)) {
    return false;
  }

  if (rule.until !== undefined) {
    try {
      parseISO(rule.until);
    } catch {
      return false;
    }
  }

  return true;
}

/**
 * Generate multiple future occurrences (for preview)
 */
export function generateOccurrences(
  startDate: string | Date,
  rule: RecurrenceRule,
  count: number = 5
): Date[] {
  const occurrences: Date[] = [];
  let currentDate = typeof startDate === 'string' ? parseISO(startDate) : startDate;

  for (let i = 0; i < count; i++) {
    currentDate = calculateNextOccurrence(currentDate, rule);

    if (!shouldContinueRecurrence(currentDate, rule)) {
      break;
    }

    occurrences.push(currentDate);
  }

  return occurrences;
}
