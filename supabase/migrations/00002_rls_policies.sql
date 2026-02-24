-- AI Todo Application - Row Level Security Policies
-- This migration sets up RLS policies for all tables

-- ============================================================================
-- ENABLE RLS
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.list_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PROFILES POLICIES
-- ============================================================================

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = id);

-- Users can insert their own profile (for initial creation)
CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() = id);

-- ============================================================================
-- LISTS POLICIES
-- ============================================================================

-- Users can view lists they own OR lists shared with them
CREATE POLICY "Users can view accessible lists"
ON public.lists FOR SELECT
USING (
  owner_id = auth.uid() OR
  id IN (
    SELECT list_id FROM public.list_shares
    WHERE shared_with = auth.uid() AND accepted = true
  )
);

-- Users can create their own lists
CREATE POLICY "Users can create own lists"
ON public.lists FOR INSERT
WITH CHECK (owner_id = auth.uid());

-- Users can update lists they own OR lists where they have edit/admin permission
CREATE POLICY "Users can update editable lists"
ON public.lists FOR UPDATE
USING (
  owner_id = auth.uid() OR
  id IN (
    SELECT list_id FROM public.list_shares
    WHERE shared_with = auth.uid() AND permission IN ('edit', 'admin') AND accepted = true
  )
);

-- Users can delete their own lists
CREATE POLICY "Users can delete own lists"
ON public.lists FOR DELETE
USING (owner_id = auth.uid());

-- ============================================================================
-- TASKS POLICIES
-- ============================================================================

-- Users can view tasks in lists they have access to
CREATE POLICY "Users can view accessible tasks"
ON public.tasks FOR SELECT
USING (
  list_id IN (
    SELECT id FROM public.lists
    WHERE owner_id = auth.uid() OR
    id IN (
      SELECT list_id FROM public.list_shares
      WHERE shared_with = auth.uid() AND accepted = true
    )
  )
);

-- Users can create tasks in lists they have edit/admin access to
CREATE POLICY "Users can create tasks in editable lists"
ON public.tasks FOR INSERT
WITH CHECK (
  list_id IN (
    SELECT id FROM public.lists
    WHERE owner_id = auth.uid() OR
    id IN (
      SELECT list_id FROM public.list_shares
      WHERE shared_with = auth.uid() AND permission IN ('edit', 'admin') AND accepted = true
    )
  ) AND created_by = auth.uid()
);

-- Users can update tasks in lists they have edit/admin access to
CREATE POLICY "Users can update tasks in editable lists"
ON public.tasks FOR UPDATE
USING (
  list_id IN (
    SELECT id FROM public.lists
    WHERE owner_id = auth.uid() OR
    id IN (
      SELECT list_id FROM public.list_shares
      WHERE shared_with = auth.uid() AND permission IN ('edit', 'admin') AND accepted = true
    )
  )
);

-- Users can delete tasks in lists they have admin access to
CREATE POLICY "Users can delete tasks with admin access"
ON public.tasks FOR DELETE
USING (
  list_id IN (
    SELECT id FROM public.lists
    WHERE owner_id = auth.uid() OR
    id IN (
      SELECT list_id FROM public.list_shares
      WHERE shared_with = auth.uid() AND permission = 'admin' AND accepted = true
    )
  )
);

-- ============================================================================
-- TASK_ATTACHMENTS POLICIES
-- ============================================================================

-- Users can view attachments on tasks they can access
CREATE POLICY "Users can view accessible attachments"
ON public.task_attachments FOR SELECT
USING (
  task_id IN (
    SELECT id FROM public.tasks
    WHERE list_id IN (
      SELECT id FROM public.lists
      WHERE owner_id = auth.uid() OR
      id IN (
        SELECT list_id FROM public.list_shares
        WHERE shared_with = auth.uid() AND accepted = true
      )
    )
  )
);

-- Users can upload attachments to tasks they have edit access to
CREATE POLICY "Users can upload attachments to editable tasks"
ON public.task_attachments FOR INSERT
WITH CHECK (
  task_id IN (
    SELECT id FROM public.tasks
    WHERE list_id IN (
      SELECT id FROM public.lists
      WHERE owner_id = auth.uid() OR
      id IN (
        SELECT list_id FROM public.list_shares
        WHERE shared_with = auth.uid() AND permission IN ('edit', 'admin') AND accepted = true
      )
    )
  ) AND uploaded_by = auth.uid()
);

-- Users can delete their own attachments OR attachments with admin access
CREATE POLICY "Users can delete own or admin attachments"
ON public.task_attachments FOR DELETE
USING (
  uploaded_by = auth.uid() OR
  task_id IN (
    SELECT id FROM public.tasks
    WHERE list_id IN (
      SELECT id FROM public.lists
      WHERE owner_id = auth.uid() OR
      id IN (
        SELECT list_id FROM public.list_shares
        WHERE shared_with = auth.uid() AND permission = 'admin' AND accepted = true
      )
    )
  )
);

-- ============================================================================
-- LIST_SHARES POLICIES
-- ============================================================================

-- Users can view shares for lists they own OR shares where they are the recipient
CREATE POLICY "Users can view relevant shares"
ON public.list_shares FOR SELECT
USING (
  shared_by = auth.uid() OR
  shared_with = auth.uid() OR
  list_id IN (
    SELECT id FROM public.lists WHERE owner_id = auth.uid()
  )
);

-- Users can create shares for lists they own
CREATE POLICY "List owners can create shares"
ON public.list_shares FOR INSERT
WITH CHECK (
  list_id IN (
    SELECT id FROM public.lists WHERE owner_id = auth.uid()
  ) AND shared_by = auth.uid()
);

-- Users can update shares they created OR accept shares sent to them
CREATE POLICY "Users can update relevant shares"
ON public.list_shares FOR UPDATE
USING (
  shared_by = auth.uid() OR
  (shared_with = auth.uid() AND OLD.accepted = false)
);

-- Users can delete shares they created
CREATE POLICY "Share creators can delete shares"
ON public.list_shares FOR DELETE
USING (
  shared_by = auth.uid() OR
  list_id IN (
    SELECT id FROM public.lists WHERE owner_id = auth.uid()
  )
);

-- ============================================================================
-- TASK_COMMENTS POLICIES
-- ============================================================================

-- Users can view comments on tasks they have access to
CREATE POLICY "Users can view accessible comments"
ON public.task_comments FOR SELECT
USING (
  task_id IN (
    SELECT id FROM public.tasks
    WHERE list_id IN (
      SELECT id FROM public.lists
      WHERE owner_id = auth.uid() OR
      id IN (
        SELECT list_id FROM public.list_shares
        WHERE shared_with = auth.uid() AND accepted = true
      )
    )
  )
);

-- Users can create comments on tasks they have access to
CREATE POLICY "Users can create comments on accessible tasks"
ON public.task_comments FOR INSERT
WITH CHECK (
  task_id IN (
    SELECT id FROM public.tasks
    WHERE list_id IN (
      SELECT id FROM public.lists
      WHERE owner_id = auth.uid() OR
      id IN (
        SELECT list_id FROM public.list_shares
        WHERE shared_with = auth.uid() AND accepted = true
      )
    )
  ) AND user_id = auth.uid()
);

-- Users can update their own comments
CREATE POLICY "Users can update own comments"
ON public.task_comments FOR UPDATE
USING (user_id = auth.uid());

-- Users can delete their own comments OR comments with admin access
CREATE POLICY "Users can delete own or admin comments"
ON public.task_comments FOR DELETE
USING (
  user_id = auth.uid() OR
  task_id IN (
    SELECT id FROM public.tasks
    WHERE list_id IN (
      SELECT id FROM public.lists
      WHERE owner_id = auth.uid() OR
      id IN (
        SELECT list_id FROM public.list_shares
        WHERE shared_with = auth.uid() AND permission = 'admin' AND accepted = true
      )
    )
  )
);

-- ============================================================================
-- ACTIVITY_LOG POLICIES
-- ============================================================================

-- Users can view activity in lists they have access to
CREATE POLICY "Users can view accessible activity"
ON public.activity_log FOR SELECT
USING (
  entity_id IN (
    SELECT id FROM public.lists
    WHERE owner_id = auth.uid() OR
    id IN (
      SELECT list_id FROM public.list_shares
      WHERE shared_with = auth.uid() AND accepted = true
    )
  ) OR
  entity_id IN (
    SELECT id FROM public.tasks
    WHERE list_id IN (
      SELECT id FROM public.lists
      WHERE owner_id = auth.uid() OR
      id IN (
        SELECT list_id FROM public.list_shares
        WHERE shared_with = auth.uid() AND accepted = true
      )
    )
  )
);

-- Activity log entries are created by triggers (no direct INSERT policy needed)

-- ============================================================================
-- SUBSCRIPTION_EVENTS POLICIES
-- ============================================================================

-- Users can view their own subscription events
CREATE POLICY "Users can view own subscription events"
ON public.subscription_events FOR SELECT
USING (user_id = auth.uid());

-- Subscription events are created by webhooks (service role bypass RLS)
