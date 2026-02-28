/**
 * Subscription tier definitions and feature limits
 */

import { SubscriptionPlan, SubscriptionLimits } from '../types';

export const SUBSCRIPTION_LIMITS: Record<string, SubscriptionLimits> = {
  free: {
    max_tasks: 50,
    max_attachments_per_task: 0,
    max_attachment_size_mb: 0,
    can_share_lists: false,
    can_use_recurring_tasks: false,
    can_use_ai_features: false,
    can_use_team_features: false,
    max_collaborators_per_list: 0,
    ai_monthly_token_limit: 0,
  },
  premium: {
    max_tasks: -1, // Unlimited
    max_attachments_per_task: 10,
    max_attachment_size_mb: 10,
    can_share_lists: false,
    can_use_recurring_tasks: true,
    can_use_ai_features: true,
    can_use_team_features: false,
    max_collaborators_per_list: 0,
    ai_monthly_token_limit: 500000,
  },
  team: {
    max_tasks: -1, // Unlimited
    max_attachments_per_task: -1, // Unlimited
    max_attachment_size_mb: 50,
    can_share_lists: true,
    can_use_recurring_tasks: true,
    can_use_ai_features: true,
    can_use_team_features: true,
    max_collaborators_per_list: -1, // Unlimited
    ai_monthly_token_limit: 2000000,
  },
};

export const SUBSCRIPTION_PLANS: Record<string, Omit<SubscriptionPlan, 'polar_product_id'>> = {
  free: {
    tier: 'free',
    name: 'Free',
    price: 0,
    currency: 'KRW',
    interval: 'month',
    features: [
      '최대 50개 작업',
      '기본 Todo 관리',
      'My Day 뷰',
      '알림 설정',
      '크로스 플랫폼 동기화',
    ],
    limits: SUBSCRIPTION_LIMITS.free,
  },
  premium: {
    tier: 'premium',
    name: 'Premium',
    price: 9900,
    currency: 'KRW',
    interval: 'month',
    features: [
      '무제한 작업',
      '파일 첨부 (작업당 10개)',
      '반복 작업',
      'AI 기능 (노아AI)',
      '우선 지원',
    ],
    limits: SUBSCRIPTION_LIMITS.premium,
  },
  team: {
    tier: 'team',
    name: 'Team / Enterprise',
    price: 29900,
    currency: 'KRW',
    interval: 'month',
    features: [
      'Premium의 모든 기능',
      '무제한 협업자',
      '팀 분석',
      '고급 공유 기능',
      '관리자 컨트롤',
      '무제한 파일 첨부',
    ],
    limits: SUBSCRIPTION_LIMITS.team,
  },
};

/**
 * Check if a feature is available for a given subscription tier
 */
export function canAccessFeature(
  tier: string,
  feature: keyof SubscriptionLimits
): boolean {
  const limits = SUBSCRIPTION_LIMITS[tier] || SUBSCRIPTION_LIMITS.free;
  const value = limits[feature];

  if (typeof value === 'boolean') {
    return value;
  }

  return value !== 0; // For numeric limits, 0 means not available
}

/**
 * Check if a user has reached the limit for a feature
 */
export function hasReachedLimit(
  tier: string,
  currentCount: number,
  limitKey: keyof SubscriptionLimits
): boolean {
  const limits = SUBSCRIPTION_LIMITS[tier] || SUBSCRIPTION_LIMITS.free;
  const limit = limits[limitKey];

  if (typeof limit !== 'number') {
    return false;
  }

  // -1 means unlimited
  if (limit === -1) {
    return false;
  }

  return currentCount >= limit;
}

/**
 * Get the remaining quota for a feature
 */
export function getRemainingQuota(
  tier: string,
  currentCount: number,
  limitKey: keyof SubscriptionLimits
): number {
  const limits = SUBSCRIPTION_LIMITS[tier] || SUBSCRIPTION_LIMITS.free;
  const limit = limits[limitKey];

  if (typeof limit !== 'number') {
    return 0;
  }

  // -1 means unlimited
  if (limit === -1) {
    return Infinity;
  }

  return Math.max(0, limit - currentCount);
}
