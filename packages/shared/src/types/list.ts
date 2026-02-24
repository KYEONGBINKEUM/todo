/**
 * List (task collection) types
 */

export interface List {
  id: string;
  owner_id: string;

  name: string;
  color?: string | null;
  icon?: string | null;
  is_default: boolean;
  position: number;

  created_at: string;
  updated_at: string;

  // Relations
  task_count?: number;
  shared_with?: ListShare[];
}

export interface CreateListInput {
  name: string;
  color?: string;
  icon?: string;
  position?: number;
}

export interface UpdateListInput {
  name?: string;
  color?: string | null;
  icon?: string | null;
  position?: number;
}

// List sharing
export type SharePermission = 'view' | 'edit' | 'admin';

export interface ListShare {
  id: string;
  list_id: string;
  shared_by: string;
  shared_with: string;

  permission: SharePermission;
  accepted: boolean;

  created_at: string;
  updated_at: string;

  // Relations
  list?: List;
  shared_with_user?: {
    id: string;
    full_name?: string;
    email: string;
    avatar_url?: string;
  };
  shared_by_user?: {
    id: string;
    full_name?: string;
    email: string;
    avatar_url?: string;
  };
}

export interface CreateListShareInput {
  list_id: string;
  shared_with_email: string; // Email of the user to share with
  permission: SharePermission;
}

export interface UpdateListShareInput {
  permission?: SharePermission;
  accepted?: boolean;
}
