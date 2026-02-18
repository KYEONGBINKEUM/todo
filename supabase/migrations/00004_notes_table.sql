-- AI Todo Application - Notes Table
-- Notion-style note taking with block-based content

-- ============================================================================
-- NOTES TABLE
-- ============================================================================

CREATE TABLE public.notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  title TEXT NOT NULL DEFAULT '제목 없음',
  icon TEXT DEFAULT '📝',
  blocks JSONB NOT NULL DEFAULT '[]'::JSONB,
  -- blocks format: [{id, type, content, checked?}]
  -- types: text, heading1, heading2, heading3, bullet, numbered, todo, quote, divider, code

  pinned BOOLEAN DEFAULT false,
  tags TEXT[],

  -- Optional: link note to a task
  linked_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.notes IS 'Notion-style notes with block-based content';

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_notes_owner_id ON public.notes(owner_id);
CREATE INDEX idx_notes_pinned ON public.notes(pinned) WHERE pinned = true;
CREATE INDEX idx_notes_linked_task ON public.notes(linked_task_id) WHERE linked_task_id IS NOT NULL;
CREATE INDEX idx_notes_updated_at ON public.notes(updated_at DESC);

-- Full-text search on title and blocks content
CREATE INDEX idx_notes_title_search ON public.notes USING gin(to_tsvector('simple', title));

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notes"
ON public.notes FOR SELECT
USING (owner_id = auth.uid());

CREATE POLICY "Users can create own notes"
ON public.notes FOR INSERT
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update own notes"
ON public.notes FOR UPDATE
USING (owner_id = auth.uid());

CREATE POLICY "Users can delete own notes"
ON public.notes FOR DELETE
USING (owner_id = auth.uid());

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- ENABLE REALTIME
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.notes;
