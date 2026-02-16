/**
 * User and Profile types
 */

export type SubscriptionTier = 'free' | 'premium' | 'team';
export type SubscriptionStatus = 'active' | 'canceled' | 'expired' | 'trialing';

export interface Profile {
  id: string;
  email: string;
  full_name?: string | null;
  avatar_url?: string | null;

  subscription_tier: SubscriptionTier;
  subscription_status: SubscriptionStatus;
  subscription_id?: string | null;
  trial_ends_at?: string | null;

  created_at: string;
  updated_at: string;
}

export interface UpdateProfileInput {
  full_name?: string;
  avatar_url?: string;
}

// User preferences (to be added later)
export interface UserPreferences {
  theme?: 'light' | 'dark' | 'system';
  default_list_id?: string;
  notifications_enabled?: boolean;
  email_notifications?: boolean;
  my_day_auto_add?: boolean;
  timezone?: string;
}
