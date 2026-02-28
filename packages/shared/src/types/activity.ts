/**
 * Activity log types
 */

export type ActivityActionType =
  | 'task_created'
  | 'task_completed'
  | 'task_updated'
  | 'task_deleted'
  | 'task_recurring'
  | 'list_created'
  | 'list_shared'
  | 'list_share_accepted'
  | 'comment_created'
  | 'comment_updated'
  | 'comment_deleted'
  | 'attachment_uploaded'
  | 'attachment_deleted';

export type ActivityEntityType = 'task' | 'list' | 'comment' | 'attachment';

export interface ActivityLog {
  id: string;
  user_id: string;

  action_type: ActivityActionType;
  entity_type: ActivityEntityType;
  entity_id: string;

  metadata?: Record<string, any> | null;

  created_at: string;

  // Relations
  user?: {
    id: string;
    full_name?: string;
    avatar_url?: string;
  };
}
