/**
 * Shared types index
 * Exports all type definitions for use in web and mobile apps
 */

// Task types
export type {
  Task,
  TaskStatus,
  TaskPriority,
  TaskAttachment,
  TaskComment,
  RecurrenceRule,
  AISuggestion,
  CreateTaskInput,
  UpdateTaskInput,
  TaskFilters,
  TaskSort,
  TaskSortField,
  TaskSortOrder,
} from './task';

// User types
export type {
  Profile,
  SubscriptionTier,
  SubscriptionStatus,
  UpdateProfileInput,
  UserPreferences,
} from './user';

// List types
export type {
  List,
  ListShare,
  SharePermission,
  CreateListInput,
  UpdateListInput,
  CreateListShareInput,
  UpdateListShareInput,
} from './list';

// Subscription types
export type {
  SubscriptionEvent,
  SubscriptionPlan,
  SubscriptionLimits,
  PolarEventType,
  PolarWebhookPayload,
} from './subscription';

// Activity types
export type {
  ActivityLog,
  ActivityActionType,
  ActivityEntityType,
} from './activity';

// Note types
export type {
  Note,
  NoteBlock,
  NoteBlockType,
  CreateNoteInput,
  UpdateNoteInput,
} from './note';

// AI types
export type {
  NoahAIAction,
  NoahAIRequest,
  NoahAIResponse,
  AIMessage,
  AISuggestionChip,
} from './ai';
