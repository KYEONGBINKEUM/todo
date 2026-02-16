-- AI Todo Application - Triggers and Functions
-- This migration creates database triggers and functions for automation

-- ============================================================================
-- AUTO-UPDATE UPDATED_AT TIMESTAMP
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.handle_updated_at() IS 'Automatically updates the updated_at timestamp';

-- Apply to tables with updated_at column
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.lists
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.list_shares
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- AUTO-CREATE PROFILE AND DEFAULT LIST FOR NEW USERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Create profile
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture')
  );

  -- Create default list
  INSERT INTO public.lists (owner_id, name, is_default, position)
  VALUES (NEW.id, 'My Tasks', true, 0);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.handle_new_user() IS 'Creates profile and default list for new users';

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- LOG TASK COMPLETION TO ACTIVITY LOG
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_task_completion()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, metadata)
    VALUES (
      auth.uid(),
      'task_completed',
      'task',
      NEW.id,
      jsonb_build_object(
        'task_title', NEW.title,
        'list_id', NEW.list_id,
        'completed_at', NEW.completed_at
      )
    );
  END IF;

  -- Update completed_at timestamp
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    NEW.completed_at = NOW();
  ELSIF NEW.status != 'completed' AND OLD.status = 'completed' THEN
    NEW.completed_at = NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.log_task_completion() IS 'Logs task completion to activity log and updates completed_at';

CREATE TRIGGER on_task_completed
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.log_task_completion();

-- ============================================================================
-- HANDLE RECURRING TASKS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_next_recurring_task()
RETURNS TRIGGER AS $$
DECLARE
  next_due_date TIMESTAMPTZ;
  freq TEXT;
  interval_val INTEGER;
BEGIN
  -- Only process if task is completed and has recurrence rule
  IF NEW.status = 'completed' AND NEW.recurrence_rule IS NOT NULL AND OLD.status != 'completed' THEN
    -- Extract recurrence parameters
    freq := NEW.recurrence_rule->>'freq';
    interval_val := COALESCE((NEW.recurrence_rule->>'interval')::INTEGER, 1);

    -- Calculate next occurrence based on recurrence rule
    CASE freq
      WHEN 'daily' THEN
        next_due_date := COALESCE(NEW.due_date, NOW()) + (interval_val || ' days')::INTERVAL;
      WHEN 'weekly' THEN
        next_due_date := COALESCE(NEW.due_date, NOW()) + (interval_val || ' weeks')::INTERVAL;
      WHEN 'monthly' THEN
        next_due_date := COALESCE(NEW.due_date, NOW()) + (interval_val || ' months')::INTERVAL;
      WHEN 'yearly' THEN
        next_due_date := COALESCE(NEW.due_date, NOW()) + (interval_val || ' years')::INTERVAL;
      ELSE
        next_due_date := COALESCE(NEW.due_date, NOW()) + '1 day'::INTERVAL;
    END CASE;

    -- Check if we should create next occurrence (respect 'until' date if present)
    IF NEW.recurrence_rule->>'until' IS NULL OR
       next_due_date <= (NEW.recurrence_rule->>'until')::TIMESTAMPTZ THEN

      -- Create next task instance
      INSERT INTO public.tasks (
        list_id,
        parent_task_id,
        created_by,
        assigned_to,
        title,
        description,
        priority,
        due_date,
        recurrence_rule,
        recurrence_parent_id,
        tags,
        position
      ) VALUES (
        NEW.list_id,
        NEW.parent_task_id,
        NEW.created_by,
        NEW.assigned_to,
        NEW.title,
        NEW.description,
        NEW.priority,
        next_due_date,
        NEW.recurrence_rule,
        COALESCE(NEW.recurrence_parent_id, NEW.id),
        NEW.tags,
        NEW.position
      );

      -- Log activity
      INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, metadata)
      VALUES (
        auth.uid(),
        'task_recurring',
        'task',
        NEW.id,
        jsonb_build_object(
          'task_title', NEW.title,
          'next_due_date', next_due_date
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.create_next_recurring_task() IS 'Creates next occurrence of a recurring task when completed';

CREATE TRIGGER on_recurring_task_completed
  AFTER UPDATE ON public.tasks
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed')
  EXECUTE FUNCTION public.create_next_recurring_task();

-- ============================================================================
-- LOG LIST SHARING ACTIVITY
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_list_share_activity()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, metadata)
    VALUES (
      NEW.shared_by,
      'list_shared',
      'list',
      NEW.list_id,
      jsonb_build_object(
        'shared_with_user_id', NEW.shared_with,
        'permission', NEW.permission
      )
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.accepted = true AND OLD.accepted = false THEN
    INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, metadata)
    VALUES (
      NEW.shared_with,
      'list_share_accepted',
      'list',
      NEW.list_id,
      jsonb_build_object(
        'shared_by_user_id', NEW.shared_by,
        'permission', NEW.permission
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.log_list_share_activity() IS 'Logs list sharing activity';

CREATE TRIGGER on_list_share_activity
  AFTER INSERT OR UPDATE ON public.list_shares
  FOR EACH ROW EXECUTE FUNCTION public.log_list_share_activity();

-- ============================================================================
-- LOG TASK CREATION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_task_creation()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, metadata)
  VALUES (
    NEW.created_by,
    'task_created',
    'task',
    NEW.id,
    jsonb_build_object(
      'task_title', NEW.title,
      'list_id', NEW.list_id
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.log_task_creation() IS 'Logs task creation to activity log';

CREATE TRIGGER on_task_created
  AFTER INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.log_task_creation();

-- ============================================================================
-- LOG COMMENT CREATION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_comment_creation()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, metadata)
  VALUES (
    NEW.user_id,
    'comment_created',
    'comment',
    NEW.id,
    jsonb_build_object(
      'task_id', NEW.task_id,
      'comment_preview', LEFT(NEW.content, 100)
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.log_comment_creation() IS 'Logs comment creation to activity log';

CREATE TRIGGER on_comment_created
  AFTER INSERT ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION public.log_comment_creation();

-- ============================================================================
-- ENABLE REALTIME
-- ============================================================================

-- Enable realtime for collaborative features
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.list_shares;
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_log;
