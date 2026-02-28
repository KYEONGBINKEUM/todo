/**
 * Task-related types
 */

export type TaskStatus = 'todo' | 'in_progress' | 'completed';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface RecurrenceRule {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number; // e.g., every 2 days, every 3 weeks
  until?: string; // ISO date string
  byweekday?: number[]; // For weekly: [0-6] where 0 = Monday
  bymonthday?: number; // For monthly: 1-31
}

export interface AISuggestion {
  type: 'priority' | 'schedule' | 'breakdown' | 'reminder';
  content: string;
  confidence: number; // 0-1
  metadata?: Record<string, any>;
}

export interface Task {
  id: string;
  list_id: string;
  parent_task_id?: string | null;
  created_by: string;
  assigned_to?: string | null;

  // Content
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority?: TaskPriority | null;

  // Dates
  due_date?: string | null; // ISO string
  reminder_at?: string | null; // ISO string
  completed_at?: string | null; // ISO string
  my_day_date?: string | null; // ISO date string (YYYY-MM-DD)

  // Recurrence
  recurrence_rule?: RecurrenceRule | null;
  recurrence_parent_id?: string | null;

  // AI features (mock for now)
  ai_priority_score?: number | null; // 0-100
  ai_suggestions?: AISuggestion[] | null;

  // Metadata
  position: number;
  tags?: string[] | null;

  created_at: string;
  updated_at: string;

  // Relations (populated via joins)
  subtasks?: Task[];
  attachments?: TaskAttachment[];
}

export interface TaskAttachment {
  id: string;
  task_id: string;
  uploaded_by: string;

  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;

  is_note: boolean;
  note_content?: string | null;

  created_at: string;
}

export interface TaskComment {
  id: string;
  task_id: string;
  user_id: string;

  content: string;
  edited: boolean;

  created_at: string;
  updated_at: string;

  // Relations
  user?: {
    id: string;
    full_name?: string;
    avatar_url?: string;
  };
}

// Task creation/update DTOs
export interface CreateTaskInput {
  list_id: string;
  parent_task_id?: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  due_date?: string;
  reminder_at?: string;
  my_day_date?: string;
  recurrence_rule?: RecurrenceRule;
  tags?: string[];
  position?: number;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  due_date?: string | null;
  reminder_at?: string | null;
  my_day_date?: string | null;
  recurrence_rule?: RecurrenceRule | null;
  tags?: string[];
  position?: number;
  assigned_to?: string | null;
}

// Task filters
export interface TaskFilters {
  status?: TaskStatus[];
  priority?: TaskPriority[];
  list_id?: string;
  assigned_to?: string;
  has_due_date?: boolean;
  is_overdue?: boolean;
  my_day_only?: boolean;
  search?: string;
  tags?: string[];
}

// Task sorting
export type TaskSortField = 'title' | 'due_date' | 'priority' | 'created_at' | 'position';
export type TaskSortOrder = 'asc' | 'desc';

export interface TaskSort {
  field: TaskSortField;
  order: TaskSortOrder;
}
