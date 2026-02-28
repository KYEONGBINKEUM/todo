/**
 * Subscription and billing types
 */

import { SubscriptionTier } from './user';

export interface SubscriptionEvent {
  id: string;
  user_id?: string | null;

  event_type: string;
  polar_subscription_id: string;
  payload: Record<string, any>;

  processed: boolean;
  processed_at?: string | null;

  created_at: string;
}

export interface SubscriptionPlan {
  tier: SubscriptionTier;
  name: string;
  price: number; // in KRW
  currency: string;
  interval: 'month' | 'year';
  features: string[];
  limits: SubscriptionLimits;
  polar_product_id: string;
}

export interface SubscriptionLimits {
  max_tasks: number; // -1 for unlimited
  max_attachments_per_task: number; // -1 for unlimited
  max_attachment_size_mb: number;
  can_share_lists: boolean;
  can_use_recurring_tasks: boolean;
  can_use_ai_features: boolean;
  can_use_team_features: boolean;
  max_collaborators_per_list: number; // -1 for unlimited
  ai_monthly_token_limit: number; // -1 for unlimited, 0 for none
}

// Polar webhook event types
export type PolarEventType =
  | 'subscription.created'
  | 'subscription.updated'
  | 'subscription.canceled'
  | 'subscription.expired'
  | 'subscription.resumed';

export interface PolarWebhookPayload {
  type: PolarEventType;
  data: {
    id: string;
    user_id: string;
    product_id: string;
    status: string;
    current_period_start: string;
    current_period_end: string;
    cancel_at_period_end: boolean;
  };
}
