/**
 * Note types (Notion-style block-based notes)
 */

export type NoteBlockType =
  | 'text'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'bullet'
  | 'numbered'
  | 'todo'
  | 'quote'
  | 'divider'
  | 'code';

export interface NoteBlock {
  id: string;
  type: NoteBlockType;
  content: string;
  checked?: boolean; // for todo blocks
}

export interface Note {
  id: string;
  owner_id: string;

  title: string;
  icon: string;
  blocks: NoteBlock[];

  pinned: boolean;
  tags?: string[] | null;

  linked_task_id?: string | null;

  created_at: string;
  updated_at: string;
}

export interface CreateNoteInput {
  title?: string;
  icon?: string;
  blocks?: NoteBlock[];
  pinned?: boolean;
  tags?: string[];
  linked_task_id?: string;
}

export interface UpdateNoteInput {
  title?: string;
  icon?: string;
  blocks?: NoteBlock[];
  pinned?: boolean;
  tags?: string[];
  linked_task_id?: string | null;
}
