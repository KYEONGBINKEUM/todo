-- AI Todo Application - Initial Schema
-- This migration creates the core database schema for the AI Todo application

-- Extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- PROFILES TABLE
-- ============================================================================
-- User profiles (extends auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,

  -- Subscription info
  subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'premium', 'team')),
  subscription_status TEXT DEFAULT 'active' CHECK (subscription_status IN ('active', 'canceled', 'expired', 'trialing')),
  subscription_id TEXT, -- Polar subscription ID
  trial_ends_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.profiles IS 'User profiles with subscription information';

-- ============================================================================
-- LISTS TABLE
-- ============================================================================
-- Collections of tasks
CREATE TABLE public.lists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  color TEXT,
  icon TEXT,
  is_default BOOLEAN DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.lists IS 'Task lists/collections';

-- ============================================================================
-- TASKS TABLE
-- ============================================================================
-- Individual tasks
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  list_id UUID NOT NULL REFERENCES public.lists(id) ON DELETE CASCADE,
  parent_task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE, -- For subtasks
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Task content
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'completed')),
  priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'urgent')),

  -- Dates
  due_date TIMESTAMPTZ,
  reminder_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  my_day_date DATE, -- Date when added to "My Day"

  -- Recurrence
  recurrence_rule JSONB, -- RRULE format: {freq: 'daily', interval: 1, until: '...'}
  recurrence_parent_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,

  -- AI features (mock for now)
  ai_priority_score INTEGER CHECK (ai_priority_score >= 0 AND ai_priority_score <= 100),
  ai_suggestions JSONB, -- Array of suggestion objects

  -- Metadata
  position INTEGER NOT NULL DEFAULT 0,
  tags TEXT[],

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.tasks IS 'Individual tasks with support for subtasks and recurrence';

-- ============================================================================
-- TASK_ATTACHMENTS TABLE
-- ============================================================================
-- Files and notes attached to tasks
CREATE TABLE public.task_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- File info
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  storage_path TEXT NOT NULL, -- Supabase Storage path

  -- For notes
  is_note BOOLEAN DEFAULT false,
  note_content TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.task_attachments IS 'Files and notes attached to tasks';

-- ============================================================================
-- LIST_SHARES TABLE
-- ============================================================================
-- List sharing for collaboration
CREATE TABLE public.list_shares (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  list_id UUID NOT NULL REFERENCES public.lists(id) ON DELETE CASCADE,
  shared_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shared_with UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  permission TEXT DEFAULT 'view' CHECK (permission IN ('view', 'edit', 'admin')),
  accepted BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(list_id, shared_with)
);

COMMENT ON TABLE public.list_shares IS 'List sharing and collaboration permissions';

-- ============================================================================
-- TASK_COMMENTS TABLE
-- ============================================================================
-- Comments on tasks for collaboration
CREATE TABLE public.task_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  content TEXT NOT NULL,
  edited BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.task_comments IS 'Comments on tasks for collaboration';

-- ============================================================================
-- ACTIVITY_LOG TABLE
-- ============================================================================
-- Activity log for collaboration and audit trail
CREATE TABLE public.activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  action_type TEXT NOT NULL, -- 'task_created', 'task_completed', 'task_shared', etc.
  entity_type TEXT NOT NULL, -- 'task', 'list', 'comment'
  entity_id UUID NOT NULL,

  metadata JSONB, -- Additional context

  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.activity_log IS 'Activity log for collaboration and audit trail';

-- ============================================================================
-- SUBSCRIPTION_EVENTS TABLE
-- ============================================================================
-- Polar webhook events
CREATE TABLE public.subscription_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  event_type TEXT NOT NULL, -- 'subscription.created', 'subscription.updated', etc.
  polar_subscription_id TEXT NOT NULL,
  payload JSONB NOT NULL,

  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.subscription_events IS 'Polar webhook events for subscription management';

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Tasks indexes
CREATE INDEX idx_tasks_list_id ON public.tasks(list_id);
CREATE INDEX idx_tasks_parent_task_id ON public.tasks(parent_task_id) WHERE parent_task_id IS NOT NULL;
CREATE INDEX idx_tasks_created_by ON public.tasks(created_by);
CREATE INDEX idx_tasks_assigned_to ON public.tasks(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_tasks_my_day_date ON public.tasks(my_day_date) WHERE my_day_date IS NOT NULL;
CREATE INDEX idx_tasks_due_date ON public.tasks(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX idx_tasks_reminder_at ON public.tasks(reminder_at) WHERE reminder_at IS NOT NULL;
CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_tasks_recurrence_parent ON public.tasks(recurrence_parent_id) WHERE recurrence_parent_id IS NOT NULL;

-- Lists indexes
CREATE INDEX idx_lists_owner_id ON public.lists(owner_id);
CREATE INDEX idx_lists_position ON public.lists(position);

-- Attachments indexes
CREATE INDEX idx_task_attachments_task_id ON public.task_attachments(task_id);
CREATE INDEX idx_task_attachments_uploaded_by ON public.task_attachments(uploaded_by);

-- Shares indexes
CREATE INDEX idx_list_shares_list_id ON public.list_shares(list_id);
CREATE INDEX idx_list_shares_shared_with ON public.list_shares(shared_with);
CREATE INDEX idx_list_shares_shared_by ON public.list_shares(shared_by);

-- Comments indexes
CREATE INDEX idx_task_comments_task_id ON public.task_comments(task_id);
CREATE INDEX idx_task_comments_user_id ON public.task_comments(user_id);

-- Activity log indexes
CREATE INDEX idx_activity_log_user_id ON public.activity_log(user_id);
CREATE INDEX idx_activity_log_entity ON public.activity_log(entity_type, entity_id);
CREATE INDEX idx_activity_log_created_at ON public.activity_log(created_at DESC);

-- Subscription events indexes
CREATE INDEX idx_subscription_events_user_id ON public.subscription_events(user_id);
CREATE INDEX idx_subscription_events_polar_id ON public.subscription_events(polar_subscription_id);
CREATE INDEX idx_subscription_events_processed ON public.subscription_events(processed) WHERE processed = false;
