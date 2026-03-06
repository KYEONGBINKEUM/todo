'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n-context';
import {
  addNote as addNoteDB, updateNote as updateNoteDB,
  softDeleteNote as softDeleteNoteDB, restoreNote as restoreNoteDB,
  permanentDeleteNote as permanentDeleteNoteDB, emptyNoteTrash as emptyNoteTrashDB,
  addFolder as addFolderDB, deleteFolder as deleteFolderDB, updateFolder as updateFolderDB,
  restoreFolder as restoreFolderDB, permanentDeleteFolder as permanentDeleteFolderDB,
} from '@/lib/firestore';
import { useDataStore } from '@/lib/data-store';
import NoahAIPageActions from '@/components/ai/NoahAIPageActions';
import type { NoahAIAction } from '@/lib/noah-ai-context';
import hljs from 'highlight.js/lib/common';

// ============================================================================
// Types
// ============================================================================

interface SubBlock {
  id: string;
  type: 'text' | 'heading2' | 'heading3' | 'bullet' | 'numbered' | 'todo' | 'quote';
  content: string;
  checked?: boolean;
}

interface NoteBlock {
  id: string;
  type: 'text' | 'heading1' | 'heading2' | 'heading3' | 'bullet' | 'numbered' | 'todo' | 'quote' | 'divider' | 'code' | 'link' | 'toggle' | 'image';
  content: string;
  checked?: boolean;
  url?: string;
  children?: string;
  subBlocks?: SubBlock[];
  imageURL?: string;
  imagePath?: string;
}

interface Note {
  id: string;
  title: string;
  icon: string;
  blocks: NoteBlock[];
  created_at: string;
  updated_at: string;
  pinned: boolean;
  tags: string[];
  folderId: string | null;
  linkedTaskId?: string | null;
  linkedTaskIds?: string[];
  starred: boolean;
  deleted?: boolean;
  deletedAt?: string | null;
  originalFolderId?: string | null;
}

interface Folder {
  id: string;
  name: string;
  color: string;
  icon: string;
  parentId?: string | null;
  deleted?: boolean;
  deletedAt?: string | null;
}

const NOTE_ICONS = ['📋', '💬', '💡', '📝', '📖', '🎯', '🔬', '📊', '🗂️', '✏️', '🧠', '⚡'];

// Slash command menu items
const SLASH_COMMANDS = [
  { type: 'text' as const, icon: 'T', label: '텍스트', desc: '일반 텍스트 블록', keywords: 'text paragraph' },
  { type: 'heading1' as const, icon: 'H1', label: '제목 1', desc: '큰 제목', keywords: 'heading1 h1 title' },
  { type: 'heading2' as const, icon: 'H2', label: '제목 2', desc: '중간 제목', keywords: 'heading2 h2' },
  { type: 'heading3' as const, icon: 'H3', label: '제목 3', desc: '작은 제목', keywords: 'heading3 h3' },
  { type: 'bullet' as const, icon: '•', label: '글머리 목록', desc: '글머리 기호 목록', keywords: 'bullet list unordered' },
  { type: 'numbered' as const, icon: '1.', label: '번호 목록', desc: '번호가 매겨진 목록', keywords: 'numbered list ordered' },
  { type: 'todo' as const, icon: '☑', label: '할 일', desc: '체크리스트 항목', keywords: 'todo checkbox check' },
  { type: 'quote' as const, icon: '"', label: '인용문', desc: '인용 블록', keywords: 'quote blockquote' },
  { type: 'code' as const, icon: '</>', label: '코드', desc: '코드 블록', keywords: 'code snippet' },
  { type: 'link' as const, icon: '🔗', label: '링크', desc: 'URL 링크 블록', keywords: 'link url' },
  { type: 'toggle' as const, icon: '▶', label: '토글', desc: '접을 수 있는 블록', keywords: 'toggle collapse expand' },
  { type: 'image' as const, icon: '🖼', label: '이미지', desc: '이미지 업로드 또는 URL', keywords: 'image picture photo img 이미지 사진' },
  { type: 'divider' as const, icon: '—', label: '구분선', desc: '수평 구분선', keywords: 'divider line separator hr' },
];

// ============================================================================
// Component
// ============================================================================

function NotesContent() {
  const { user } = useAuth();
  const { t, language } = useI18n();
  const dateLocale = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', es: 'es-ES', pt: 'pt-BR', fr: 'fr-FR' }[language] ?? 'en-US';
  const searchParams = useSearchParams();
  const { notes: storeNotes, folders: storeFolders, loading: storeLoading } = useDataStore();
  const initializedRef = useRef(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [trashedFolders, setTrashedFolders] = useState<Folder[]>([]);
  const [trashedNotes, setTrashedNotes] = useState<Note[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showFolderCreator, setShowFolderCreator] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [pageLoading, setPageLoading] = useState(true);
  const [showTrash, setShowTrash] = useState(false);

  // Folder rename state
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');

  // Subfolder creation
  const [creatingSubfolderId, setCreatingSubfolderId] = useState<string | null>(null);
  const [newSubfolderName, setNewSubfolderName] = useState('');

  // Subfolder move
  const [movingFolderId, setMovingFolderId] = useState<string | null>(null);

  // Read-only mode
  const [readOnly, setReadOnly] = useState(false);
  const [showMobileToolbar, setShowMobileToolbar] = useState(false);

  // 노트 목록 패널 접기/펼치기 (데스크탑)
  const [listPanelCollapsed, setListPanelCollapsed] = useState(false);

  // Undo / Redo history (per active note)
  const historyRef = useRef<Map<string, { past: NoteBlock[][]; future: NoteBlock[][] }>>(new Map());
  const skipHistoryRef = useRef(false);
  const historyTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSnapshotRef = useRef<string>(''); // JSON of last saved snapshot to avoid duplicates

  // Folder toggle tree
  const [openFolderIds, setOpenFolderIds] = useState<Set<string>>(new Set());
  // Toggle blocks
  const [openToggleIds, setOpenToggleIds] = useState<Set<string>>(new Set());
  // Code blocks in edit mode (textarea shown instead of highlighted pre)
  const [editingCodeIds, setEditingCodeIds] = useState<Set<string>>(new Set());

  // Block drag-and-drop state
  const [dragBlockSrcIdx, setDragBlockSrcIdx] = useState<number | null>(null);
  const [dragBlockOverIdx, setDragBlockOverIdx] = useState<number | null>(null);
  const dragSrcRef = useRef<number | null>(null);
  const dragDstRef = useRef<number | null>(null);
  const streamIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Slash command menu state
  const [slashMenuVisible, setSlashMenuVisible] = useState(false);
  const [slashMenuBlockId, setSlashMenuBlockId] = useState<string | null>(null);
  const [slashMenuFilter, setSlashMenuFilter] = useState('');
  const [slashMenuIndex, setSlashMenuIndex] = useState(0);
  const slashMenuRef = useRef<HTMLDivElement>(null);

  // Block type change menu
  const [blockTypeMenuId, setBlockTypeMenuId] = useState<string | null>(null);
  const blockTypeMenuRef = useRef<HTMLDivElement>(null);

  // Initialize from global data store (once on first load)
  useEffect(() => {
    if (storeLoading || initializedRef.current) return;
    initializedRef.current = true;

    const allNotes: Note[] = storeNotes.map((n) => ({
      id: n.id!,
      title: n.title,
      icon: n.icon,
      blocks: n.blocks as NoteBlock[],
      created_at: n.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      updated_at: n.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      pinned: n.pinned,
      tags: n.tags,
      folderId: n.folderId,
      linkedTaskId: n.linkedTaskId || null,
      linkedTaskIds: n.linkedTaskIds || [],
      starred: n.starred ?? false,
      deleted: (n as any).deleted ?? false,
      deletedAt: (n as any).deletedAt ?? null,
      originalFolderId: (n as any).originalFolderId ?? null,
    }));
    const activeNotes = allNotes.filter((n) => !n.deleted);
    const trashNotes = allNotes.filter((n) => n.deleted);
    // Auto-cleanup: permanently delete notes older than 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const expired = trashNotes.filter((n) => n.deletedAt && n.deletedAt < thirtyDaysAgo);
    if (expired.length > 0 && user) {
      emptyNoteTrashDB(user.uid, expired.map((n) => n.id)).catch(console.error);
    }
    const remainingTrashed = trashNotes.filter((n) => !n.deletedAt || n.deletedAt >= thirtyDaysAgo);
    setNotes(activeNotes);
    setTrashedNotes(remainingTrashed);
    const paramNoteId = searchParams.get('note');
    if (paramNoteId && activeNotes.find((n) => n.id === paramNoteId)) {
      setActiveNoteId(paramNoteId);
    } else if (activeNotes.length > 0) {
      setActiveNoteId(activeNotes[0].id);
    }

    const allFolders: Folder[] = storeFolders.map((f) => ({
      id: f.id!,
      name: f.name,
      color: f.color,
      icon: f.icon,
      parentId: f.parentId ?? null,
      deleted: f.deleted ?? false,
      deletedAt: f.deletedAt ?? null,
    }));
    const mappedFolders = allFolders.filter((f) => !f.deleted);
    const trashed = allFolders.filter((f) => f.deleted);
    setFolders(mappedFolders);
    setTrashedFolders(trashed);
    setOpenFolderIds(new Set(mappedFolders.map((f) => f.id)));
    setPageLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeLoading]);

  const saveNoteToFirestore = useCallback(async (note: Note) => {
    if (!user) return;
    try {
      await updateNoteDB(user.uid, note.id, {
        title: note.title,
        icon: note.icon,
        blocks: note.blocks,
        pinned: note.pinned,
        starred: note.starred,
        tags: note.tags,
        folderId: note.folderId,
        linkedTaskId: note.linkedTaskId,
        linkedTaskIds: note.linkedTaskIds,
      });
    } catch (err) {
      console.error('Failed to save note:', err);
    }
  }, [user]);

  const activeNote = notes.find((n) => n.id === activeNoteId);

  const searchFiltered = !searchQuery
    ? notes
    : notes.filter(
        (n) =>
          n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          n.blocks.some((b) => b.content.toLowerCase().includes(searchQuery.toLowerCase()))
      );

  // ========== Auto-save debounce ==========
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const debouncedSave = useCallback((note: Note) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { saveNoteToFirestore(note); }, 400);
  }, [saveNoteToFirestore]);

  // ========== Noah AI: apply note from AI ==========
  useEffect(() => {
    const handleAIApplyNote = async (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || !user) return;
      const aiBlocks: NoteBlock[] = (detail.blocks || []).map((b: any, i: number) => ({
        id: `${Date.now()}-ai-${i}`,
        type: b.type || 'text',
        content: b.content || '',
      }));
      if (aiBlocks.length === 0) return;

      // If there's an active note and it's empty (just one empty text block), fill it
      const current = notes.find((n) => n.id === activeNoteId);
      if (current && current.blocks.length <= 1 && !current.blocks[0]?.content?.trim()) {
        const updatedNote: Note = {
          ...current,
          title: detail.title || current.title,
          blocks: aiBlocks,
          updated_at: new Date().toISOString(),
        };
        setNotes((prev) => prev.map((n) => n.id === current.id ? updatedNote : n));
        saveNoteToFirestore(updatedNote);
        return;
      }

      // Otherwise create a new note with AI content
      const tempId = Date.now().toString();
      const newNote: Note = {
        id: tempId,
        title: detail.title || 'AI 노트',
        icon: '🤖',
        blocks: aiBlocks,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        pinned: false,
        starred: false,
        tags: [],
        folderId: null,
        linkedTaskId: null,
        linkedTaskIds: [],
      };
      setNotes((prev) => [newNote, ...prev]);
      setActiveNoteId(tempId);
      try {
        const realId = await addNoteDB(user.uid, {
          title: newNote.title, icon: newNote.icon, blocks: newNote.blocks,
          pinned: false, tags: [], folderId: null, linkedTaskId: null, linkedTaskIds: [],
        });
        setNotes((prev) => prev.map((n) => n.id === tempId ? { ...n, id: realId } : n));
        setActiveNoteId(realId);
      } catch (err) {
        console.error('Failed to create AI note:', err);
      }
    };

    window.addEventListener('noah-ai-apply-note', handleAIApplyNote);
    return () => window.removeEventListener('noah-ai-apply-note', handleAIApplyNote);
  }, [user, activeNoteId, notes, saveNoteToFirestore]);

  // ========== Noah AI: stream note with typing animation ==========
  useEffect(() => {
    const handleStreamNote = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || !user) return;

      const targetBlocks: NoteBlock[] = (detail.blocks || []).map((b: any, i: number) => ({
        id: `${Date.now()}-ai-${i}-${Math.random().toString(36).slice(2, 5)}`,
        type: b.type || 'text',
        content: b.content || '',
      }));
      if (targetBlocks.length === 0) return;

      // Clear any in-progress stream
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);

      const tempId = `ai-stream-${Date.now()}`;
      const newNote: Note = {
        id: tempId,
        title: detail.title || 'AI 노트',
        icon: '🤖',
        blocks: [{ ...targetBlocks[0], content: '' }],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        pinned: false, starred: false, tags: [],
        folderId: null, linkedTaskId: null, linkedTaskIds: [],
      };

      setNotes(prev => [newNote, ...prev]);
      setActiveNoteId(tempId);

      const CHARS_PER_TICK = 20;
      const TICK_MS = 30;
      let blockIdx = 0;
      let charIdx = 0;

      streamIntervalRef.current = setInterval(() => {
        const block = targetBlocks[blockIdx];
        if (!block) {
          clearInterval(streamIntervalRef.current!);
          streamIntervalRef.current = null;
          // Final: ensure full content is visible then save
          setNotes(prev => prev.map(n => n.id === tempId ? { ...n, blocks: targetBlocks } : n));
          addNoteDB(user.uid, {
            title: newNote.title, icon: newNote.icon, blocks: targetBlocks,
            pinned: false, tags: [], folderId: null, linkedTaskId: null, linkedTaskIds: [],
          }).then(realId => {
            setNotes(prev => prev.map(n => n.id === tempId ? { ...n, id: realId } : n));
            setActiveNoteId(realId);
          }).catch(console.error);
          return;
        }

        charIdx = Math.min(charIdx + CHARS_PER_TICK, block.content.length);
        const displayedContent = block.content.slice(0, charIdx);
        const isBlockDone = charIdx >= block.content.length;

        setNotes(prev => prev.map(n => {
          if (n.id !== tempId) return n;
          const shownBlocks: NoteBlock[] = [];
          for (let i = 0; i <= blockIdx; i++) {
            if (i < blockIdx) {
              shownBlocks.push(targetBlocks[i]);
            } else {
              shownBlocks.push({ ...targetBlocks[i], content: displayedContent });
            }
          }
          return { ...n, blocks: shownBlocks };
        }));

        if (isBlockDone) {
          blockIdx++;
          charIdx = 0;
        }
      }, TICK_MS);
    };

    window.addEventListener('noah-ai-stream-note', handleStreamNote);
    return () => {
      window.removeEventListener('noah-ai-stream-note', handleStreamNote);
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
    };
  }, [user]);

  // ========== Undo / Redo ==========

  const getHistory = (noteId: string) => {
    if (!historyRef.current.has(noteId)) {
      historyRef.current.set(noteId, { past: [], future: [] });
    }
    return historyRef.current.get(noteId)!;
  };

  /** 현재 블록 상태를 히스토리에 push (변경 전 호출) */
  const pushHistory = (noteId: string, blocks: NoteBlock[], immediate = false) => {
    if (skipHistoryRef.current) return;
    const snapshot = JSON.stringify(blocks);
    if (snapshot === lastSnapshotRef.current) return; // 중복 방지

    const doPush = () => {
      const h = getHistory(noteId);
      h.past.push(JSON.parse(snapshot));
      if (h.past.length > 50) h.past.shift();
      h.future = [];
      lastSnapshotRef.current = snapshot;
    };

    if (immediate) {
      // 구조 변경(블록 추가/삭제/이동/타입변경)은 즉시 저장
      if (historyTimerRef.current) { clearTimeout(historyTimerRef.current); historyTimerRef.current = null; }
      doPush();
    } else {
      // 텍스트 입력은 500ms 디바운스 — 타이핑 중 매 글자마다 저장 방지
      if (!historyTimerRef.current) {
        doPush(); // 타이핑 시작 시점 저장
      }
      if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
      historyTimerRef.current = setTimeout(() => { historyTimerRef.current = null; }, 500);
    }
  };

  const undo = () => {
    if (!activeNote) return;
    const h = getHistory(activeNote.id);
    if (!h.past.length) return;
    const prev = h.past.pop()!;
    h.future.push(JSON.parse(JSON.stringify(activeNote.blocks)));
    skipHistoryRef.current = true;
    setNotes((ns) => {
      const updated = ns.map((n) => n.id === activeNote.id ? { ...n, blocks: prev, updated_at: new Date().toISOString() } : n);
      const note = updated.find((n) => n.id === activeNote.id);
      if (note) debouncedSave(note);
      return updated;
    });
    skipHistoryRef.current = false;
  };

  const redo = () => {
    if (!activeNote) return;
    const h = getHistory(activeNote.id);
    if (!h.future.length) return;
    const next = h.future.pop()!;
    h.past.push(JSON.parse(JSON.stringify(activeNote.blocks)));
    skipHistoryRef.current = true;
    setNotes((ns) => {
      const updated = ns.map((n) => n.id === activeNote.id ? { ...n, blocks: next, updated_at: new Date().toISOString() } : n);
      const note = updated.find((n) => n.id === activeNote.id);
      if (note) debouncedSave(note);
      return updated;
    });
    skipHistoryRef.current = false;
  };

  const canUndo = activeNote ? (getHistory(activeNote.id).past.length > 0) : false;
  const canRedo = activeNote ? (getHistory(activeNote.id).future.length > 0) : false;

  // Ctrl+Z / Ctrl+Shift+Z 글로벌 키보드 단축키
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!activeNote || readOnly) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  // ========== Note CRUD ==========

  const createNote = async (folderId?: string | null) => {
    const tempId = Date.now().toString();
    const newNote: Note = {
      id: tempId,
      title: '제목 없음',
      icon: '📝',
      blocks: [{ id: `${Date.now()}-b1`, type: 'text', content: '' }],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      pinned: false,
      starred: false,
      tags: [],
      folderId: folderId ?? null,
      linkedTaskId: null,
      linkedTaskIds: [],
    };
    setNotes((prev) => [newNote, ...prev]);
    setActiveNoteId(tempId);

    if (user) {
      try {
        const realId = await addNoteDB(user.uid, {
          title: newNote.title,
          icon: newNote.icon,
          blocks: newNote.blocks,
          pinned: newNote.pinned,
          tags: newNote.tags,
          folderId: newNote.folderId,
          linkedTaskId: newNote.linkedTaskId,
          linkedTaskIds: newNote.linkedTaskIds,
        });
        setNotes((prev) => prev.map((n) => n.id === tempId ? { ...n, id: realId } : n));
        setActiveNoteId(realId);
      } catch (err) {
        console.error('Failed to create note:', err);
      }
    }
  };

  const deleteNote = async (id: string) => {
    const note = notes.find((n) => n.id === id);
    if (!note) return;
    const trashedNote = { ...note, deleted: true, deletedAt: new Date().toISOString(), originalFolderId: note.folderId };
    setNotes((prev) => prev.filter((n) => n.id !== id));
    setTrashedNotes((prev) => [...prev, trashedNote]);
    if (activeNoteId === id) {
      const remaining = notes.filter((n) => n.id !== id);
      setActiveNoteId(remaining[0]?.id || '');
    }
    if (user) {
      try { await softDeleteNoteDB(user.uid, id, note.folderId); }
      catch (err) { console.error('Failed to soft-delete note:', err); }
    }
  };

  const restoreNoteFn = async (noteId: string) => {
    const note = trashedNotes.find((n) => n.id === noteId);
    if (!note || !user) return;
    const folderIds = folders.map((f) => f.id);
    const targetFolderId = note.originalFolderId && folderIds.includes(note.originalFolderId)
      ? note.originalFolderId : null;
    const restoredNote = { ...note, deleted: false, deletedAt: null, originalFolderId: null, folderId: targetFolderId };
    setTrashedNotes((prev) => prev.filter((n) => n.id !== noteId));
    setNotes((prev) => [...prev, restoredNote]);
    try { await restoreNoteDB(user.uid, noteId, note.originalFolderId ?? null, folderIds); }
    catch (err) { console.error('Failed to restore note:', err); }
  };

  const permanentDeleteNoteFn = async (noteId: string) => {
    if (!user) return;
    setTrashedNotes((prev) => prev.filter((n) => n.id !== noteId));
    try { await permanentDeleteNoteDB(user.uid, noteId); }
    catch (err) { console.error('Failed to permanently delete note:', err); }
  };

  const emptyTrashFn = async () => {
    if (!user || trashedNotes.length === 0) return;
    const ids = trashedNotes.map((n) => n.id);
    setTrashedNotes([]);
    try { await emptyNoteTrashDB(user.uid, ids); }
    catch (err) { console.error('Failed to empty trash:', err); }
  };

  const updateNoteTitle = (title: string) => {
    setNotes((prev) => {
      const updated = prev.map((n) =>
        n.id === activeNoteId ? { ...n, title, updated_at: new Date().toISOString() } : n
      );
      const note = updated.find((n) => n.id === activeNoteId);
      if (note) debouncedSave(note);
      return updated;
    });
  };

  const updateNoteIcon = (icon: string) => {
    setNotes((prev) => {
      const updated = prev.map((n) => (n.id === activeNoteId ? { ...n, icon } : n));
      const note = updated.find((n) => n.id === activeNoteId);
      if (note) debouncedSave(note);
      return updated;
    });
    setShowIconPicker(false);
  };

  const togglePin = (id: string) => {
    setNotes((prev) => {
      const updated = prev.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n));
      const note = updated.find((n) => n.id === id);
      if (note) saveNoteToFirestore(note);
      return updated;
    });
  };

  const toggleStar = (id: string) => {
    setNotes((prev) => {
      const updated = prev.map((n) => (n.id === id ? { ...n, starred: !n.starred } : n));
      const note = updated.find((n) => n.id === id);
      if (note) saveNoteToFirestore(note);
      return updated;
    });
  };

  const moveToFolder = (noteId: string, folderId: string | null) => {
    setNotes((prev) => {
      const updated = prev.map((n) => (n.id === noteId ? { ...n, folderId } : n));
      const note = updated.find((n) => n.id === noteId);
      if (note) saveNoteToFirestore(note);
      return updated;
    });
  };

  // ========== Folder CRUD ==========

  const createFolder = async (parentId: string | null = null, nameOverride?: string) => {
    const name = (nameOverride ?? newFolderName).trim();
    if (!name) return;
    const colors = ['#e94560', '#8b5cf6', '#06b6d4', '#22c55e', '#f59e0b', '#ec4899'];
    const icons = ['📁', '📂', '🗂️', '📦'];
    const tempId = Date.now().toString();
    const newFolder: Folder = {
      id: tempId,
      name,
      color: colors[folders.length % colors.length],
      icon: icons[folders.length % icons.length],
      parentId,
    };
    setFolders((prev) => [...prev, newFolder]);
    setOpenFolderIds((prev) => new Set([...prev, tempId]));
    if (!nameOverride) { setNewFolderName(''); setShowFolderCreator(false); }
    setCreatingSubfolderId(null); setNewSubfolderName('');

    if (user) {
      try {
        const realId = await addFolderDB(user.uid, { name, color: newFolder.color, icon: newFolder.icon, parentId });
        setFolders((prev) => prev.map((f) => f.id === tempId ? { ...f, id: realId } : f));
        setOpenFolderIds((prev) => {
          const next = new Set(prev);
          next.delete(tempId);
          next.add(realId);
          return next;
        });
      } catch (err) {
        console.error('Failed to create folder:', err);
      }
    }
  };

  const renameFolder = async (folderId: string) => {
    if (!editingFolderName.trim()) { setEditingFolderId(null); return; }
    setFolders((prev) => prev.map((f) => f.id === folderId ? { ...f, name: editingFolderName.trim() } : f));
    setEditingFolderId(null);
    if (user) {
      try {
        await updateFolderDB(user.uid, folderId, { name: editingFolderName.trim() });
      } catch (err) {
        console.error('Failed to rename folder:', err);
      }
    }
  };

  const deleteFolder = async (folderId: string) => {
    // 소프트 삭제: 휴지통으로 이동
    const folder = folders.find((f) => f.id === folderId);
    if (!folder) return;
    const deletedFolder = { ...folder, deleted: true, deletedAt: new Date().toISOString() };
    setFolders((prev) => prev.filter((f) => f.id !== folderId));
    setTrashedFolders((prev) => [...prev, deletedFolder]);
    setOpenFolderIds((prev) => { const next = new Set(prev); next.delete(folderId); return next; });
    if (user) {
      try {
        await deleteFolderDB(user.uid, folderId);
      } catch (err) {
        console.error('Failed to move folder to trash:', err);
      }
    }
  };

  const restoreFolderFn = async (folderId: string) => {
    const folder = trashedFolders.find((f) => f.id === folderId);
    if (!folder) return;
    const restoredFolder = { ...folder, deleted: false, deletedAt: null };
    setTrashedFolders((prev) => prev.filter((f) => f.id !== folderId));
    setFolders((prev) => [...prev, restoredFolder]);
    setOpenFolderIds((prev) => new Set([...prev, folderId]));
    if (user) {
      try {
        await restoreFolderDB(user.uid, folderId);
      } catch (err) {
        console.error('Failed to restore folder:', err);
      }
    }
  };

  const permanentDeleteFolderFn = async (folderId: string) => {
    setTrashedFolders((prev) => prev.filter((f) => f.id !== folderId));
    if (user) {
      try {
        await permanentDeleteFolderDB(user.uid, folderId);
      } catch (err) {
        console.error('Failed to permanently delete folder:', err);
      }
    }
  };

  const moveFolderTo = async (folderId: string, newParentId: string | null) => {
    setFolders((prev) => prev.map((f) => f.id === folderId ? { ...f, parentId: newParentId } : f));
    setMovingFolderId(null);
    if (user) {
      try {
        await updateFolderDB(user.uid, folderId, { parentId: newParentId });
      } catch (err) {
        console.error('Failed to move folder:', err);
      }
    }
  };

  const toggleFolder = (folderId: string) => {
    setOpenFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  // ========== Block Operations ==========

  const updateBlock = (blockId: string, content: string) => {
    setNotes((prev) => {
      const cur = prev.find((n) => n.id === activeNoteId);
      if (cur) pushHistory(activeNoteId, cur.blocks);
      const updated = prev.map((n) =>
        n.id === activeNoteId
          ? { ...n, updated_at: new Date().toISOString(), blocks: n.blocks.map((b) => (b.id === blockId ? { ...b, content } : b)) }
          : n
      );
      const note = updated.find((n) => n.id === activeNoteId);
      if (note) debouncedSave(note);
      return updated;
    });
  };

  const updateBlockField = (blockId: string, fields: Partial<NoteBlock>) => {
    setNotes((prev) => {
      const cur = prev.find((n) => n.id === activeNoteId);
      if (cur) pushHistory(activeNoteId, cur.blocks);
      const updated = prev.map((n) =>
        n.id === activeNoteId
          ? { ...n, blocks: n.blocks.map((b) => (b.id === blockId ? { ...b, ...fields } : b)) }
          : n
      );
      const note = updated.find((n) => n.id === activeNoteId);
      if (note) debouncedSave(note);
      return updated;
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, blockId: string) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    try {
      const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
      const { storage } = await import('@/lib/firebase');
      const path = `users/${user.uid}/notes/${activeNoteId}/${Date.now()}_${file.name}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      updateBlockField(blockId, { imageURL: url, imagePath: path, content: file.name });
    } catch (err) {
      console.error('Failed to upload image:', err);
    }
  };

  const handleImageURL = (url: string, blockId: string) => {
    if (!url.trim()) return;
    updateBlockField(blockId, { imageURL: url.trim(), content: url });
  };

  const toggleTodo = (blockId: string) => {
    setNotes((prev) => {
      const cur = prev.find((n) => n.id === activeNoteId);
      if (cur) pushHistory(activeNoteId, cur.blocks, true);
      const updated = prev.map((n) =>
        n.id === activeNoteId
          ? { ...n, blocks: n.blocks.map((b) => (b.id === blockId ? { ...b, checked: !b.checked } : b)) }
          : n
      );
      const note = updated.find((n) => n.id === activeNoteId);
      if (note) debouncedSave(note);
      return updated;
    });
  };

  const addBlockAfter = (blockId: string, type: NoteBlock['type'] = 'text') => {
    const newBlock: NoteBlock = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      content: '',
      ...(type === 'todo' && { checked: false }),
      ...(type === 'toggle' && { children: '' }),
    };

    setNotes((prev) => {
      const cur = prev.find((n) => n.id === activeNoteId);
      if (cur) pushHistory(activeNoteId, cur.blocks, true);
      const updated = prev.map((n) => {
        if (n.id !== activeNoteId) return n;
        const idx = n.blocks.findIndex((b) => b.id === blockId);
        const newBlocks = [...n.blocks];
        newBlocks.splice(idx + 1, 0, newBlock);
        return { ...n, blocks: newBlocks, updated_at: new Date().toISOString() };
      });
      const note = updated.find((n) => n.id === activeNoteId);
      if (note) debouncedSave(note);
      return updated;
    });

    setTimeout(() => {
      const el = document.querySelector(`[data-block-id="${newBlock.id}"]`) as HTMLElement;
      el?.focus();
    }, 50);
  };

  const deleteBlock = (blockId: string) => {
    setNotes((prev) => {
      const cur = prev.find((n) => n.id === activeNoteId);
      if (cur) pushHistory(activeNoteId, cur.blocks, true);
      const updated = prev.map((n) => {
        if (n.id !== activeNoteId) return n;
        if (n.blocks.length <= 1) return n;
        return { ...n, blocks: n.blocks.filter((b) => b.id !== blockId) };
      });
      const note = updated.find((n) => n.id === activeNoteId);
      if (note) debouncedSave(note);
      return updated;
    });
  };

  const changeBlockType = (blockId: string, newType: NoteBlock['type']) => {
    setNotes((prev) => {
      const cur = prev.find((n) => n.id === activeNoteId);
      if (cur) pushHistory(activeNoteId, cur.blocks, true);
      const updated = prev.map((n) =>
        n.id === activeNoteId
          ? {
              ...n,
              blocks: n.blocks.map((b) =>
                b.id === blockId
                  ? { ...b, type: newType, ...(newType === 'todo' ? { checked: false } : {}), ...(newType === 'toggle' ? { subBlocks: [] } : {}), ...(newType === 'link' ? { url: '' } : {}) }
                  : b
              ),
            }
          : n
      );
      const note = updated.find((n) => n.id === activeNoteId);
      if (note) debouncedSave(note);
      return updated;
    });
  };

  // ========== Slash command helpers ==========

  const filteredSlashCommands = SLASH_COMMANDS.filter((cmd) => {
    if (!slashMenuFilter) return true;
    const q = slashMenuFilter.toLowerCase();
    return cmd.label.toLowerCase().includes(q) || cmd.keywords.includes(q) || cmd.type.includes(q);
  });

  const selectSlashCommand = (type: NoteBlock['type']) => {
    if (slashMenuBlockId) {
      changeBlockType(slashMenuBlockId, type);
      updateBlock(slashMenuBlockId, '');
    }
    setSlashMenuVisible(false);
    setSlashMenuBlockId(null);
    setSlashMenuFilter('');
    setSlashMenuIndex(0);
  };

  // ========== Block key handler ==========

  const handleBlockKeyDown = (e: React.KeyboardEvent, block: NoteBlock) => {
    // Slash command navigation
    if (slashMenuVisible && slashMenuBlockId === block.id) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashMenuIndex((prev) => Math.min(prev + 1, filteredSlashCommands.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashMenuIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredSlashCommands[slashMenuIndex]) {
          selectSlashCommand(filteredSlashCommands[slashMenuIndex].type);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashMenuVisible(false);
        setSlashMenuBlockId(null);
        setSlashMenuFilter('');
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      if (slashMenuVisible) return;
      e.preventDefault();
      const inheritType = ['todo', 'bullet', 'numbered'].includes(block.type) ? block.type : 'text';
      addBlockAfter(block.id, inheritType as NoteBlock['type']);
    }
    if (e.key === 'Backspace' && block.content === '') {
      e.preventDefault();
      if (block.type !== 'text') {
        changeBlockType(block.id, 'text');
      } else {
        deleteBlock(block.id);
      }
    }
    if (e.key === ' ' && block.type === 'text') {
      const c = block.content;
      if (c === '#') { changeBlockType(block.id, 'heading1'); updateBlock(block.id, ''); e.preventDefault(); }
      else if (c === '##') { changeBlockType(block.id, 'heading2'); updateBlock(block.id, ''); e.preventDefault(); }
      else if (c === '###') { changeBlockType(block.id, 'heading3'); updateBlock(block.id, ''); e.preventDefault(); }
      else if (c === '-' || c === '*') { changeBlockType(block.id, 'bullet'); updateBlock(block.id, ''); e.preventDefault(); }
      else if (c === '1.') { changeBlockType(block.id, 'numbered'); updateBlock(block.id, ''); e.preventDefault(); }
      else if (c === '[]' || c === '[ ]') { changeBlockType(block.id, 'todo'); updateBlock(block.id, ''); e.preventDefault(); }
      else if (c === '>') { changeBlockType(block.id, 'quote'); updateBlock(block.id, ''); e.preventDefault(); }
      else if (c === '---') { changeBlockType(block.id, 'divider'); updateBlock(block.id, ''); e.preventDefault(); }
      else if (c === '```') { changeBlockType(block.id, 'code'); updateBlock(block.id, ''); e.preventDefault(); }
      else if (c === '[[') { changeBlockType(block.id, 'link'); updateBlock(block.id, ''); e.preventDefault(); }
      else if (c === '>>') { changeBlockType(block.id, 'toggle'); updateBlock(block.id, ''); e.preventDefault(); }
    }

    // Ctrl+B: bold, Ctrl+I: italic, Ctrl+Shift+S: strikethrough
    const isMod = e.ctrlKey || e.metaKey;
    if (isMod && !e.altKey) {
      const ta = e.target as HTMLTextAreaElement;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      if (start !== end) {
        const selected = block.content.slice(start, end);
        let wrapped = '';
        if (e.key === 'b' && !e.shiftKey) {
          wrapped = `**${selected}**`;
          e.preventDefault();
        } else if (e.key === 'i' && !e.shiftKey) {
          wrapped = `*${selected}*`;
          e.preventDefault();
        } else if (e.key === 's' && e.shiftKey) {
          wrapped = `~~${selected}~~`;
          e.preventDefault();
        }
        if (wrapped) {
          const newContent = block.content.slice(0, start) + wrapped + block.content.slice(end);
          updateBlock(block.id, newContent);
          setTimeout(() => { ta.selectionStart = start; ta.selectionEnd = start + wrapped.length; }, 0);
        }
      }
    }

    // Tab: indent list, Shift+Tab: outdent
    if (e.key === 'Tab' && ['bullet', 'numbered', 'todo'].includes(block.type)) {
      e.preventDefault();
      if (e.shiftKey) {
        // Outdent: remove leading 2 spaces
        if (block.content.startsWith('  ')) {
          updateBlock(block.id, block.content.slice(2));
        }
      } else {
        // Indent: add 2 spaces
        updateBlock(block.id, '  ' + block.content);
      }
    }
  };

  // Handle input change for slash command detection
  const handleBlockInput = (blockId: string, content: string) => {
    updateBlock(blockId, content);

    // Detect '/' for slash command
    if (content === '/') {
      setSlashMenuVisible(true);
      setSlashMenuBlockId(blockId);
      setSlashMenuFilter('');
      setSlashMenuIndex(0);
    } else if (content.startsWith('/') && slashMenuVisible && slashMenuBlockId === blockId) {
      setSlashMenuFilter(content.slice(1));
      setSlashMenuIndex(0);
    } else if (slashMenuVisible && slashMenuBlockId === blockId && !content.startsWith('/')) {
      setSlashMenuVisible(false);
      setSlashMenuBlockId(null);
      setSlashMenuFilter('');
    }
  };

  // ========== Block drag-and-drop ==========

  const handleBlockDragStart = (e: React.DragEvent, idx: number) => {
    setDragBlockSrcIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
  };

  const handleBlockDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragBlockOverIdx(idx);
  };

  const handleBlockDragEnd = () => {
    setDragBlockSrcIdx(null);
    setDragBlockOverIdx(null);
  };

  const handleBlockDrop = (e: React.DragEvent, dstIdx: number) => {
    e.preventDefault();
    const srcIdx = dragBlockSrcIdx;
    handleBlockDragEnd();
    if (srcIdx === null || srcIdx === dstIdx || !activeNote) return;

    setNotes((prev) => {
      const cur = prev.find((n) => n.id === activeNoteId);
      if (cur) pushHistory(activeNoteId, cur.blocks, true);
      const updated = prev.map((n) => {
        if (n.id !== activeNoteId) return n;
        const newBlocks = [...n.blocks];
        const [moved] = newBlocks.splice(srcIdx, 1);
        newBlocks.splice(dstIdx, 0, moved);
        return { ...n, blocks: newBlocks, updated_at: new Date().toISOString() };
      });
      const note = updated.find((n) => n.id === activeNoteId);
      if (note) debouncedSave(note);
      return updated;
    });
  };

  // ========== Render Helpers ==========

  const getRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    if (diffMins < 1) return '방금 전';
    if (diffMins < 60) return `${diffMins}분 전`;
    if (diffHours < 24) return `${diffHours}시간 전`;
    if (diffDays < 7) return `${diffDays}일 전`;
    return date.toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' });
  };

  // 자동 높이 조절 textarea 헬퍼
  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };

  // 노트 전환 또는 블록 수 변경 시 모든 textarea 높이 초기화
  useEffect(() => {
    if (!activeNoteId) return;
    requestAnimationFrame(() => {
      document.querySelectorAll<HTMLTextAreaElement>('[data-block-id]').forEach(autoResize);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNoteId, activeNote?.blocks.length]);

  const renderBlock = (block: NoteBlock) => {
    const baseClass = 'w-full bg-transparent outline-none resize-none text-text-primary placeholder-text-inactive';
    const taProps = (extra: string, placeholder: string) => ({
      'data-block-id': block.id,
      value: block.content,
      onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => { handleBlockInput(block.id, e.target.value); autoResize(e.target); },
      onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => handleBlockKeyDown(e, block),
      onFocus: (e: React.FocusEvent<HTMLTextAreaElement>) => autoResize(e.target),
      placeholder: readOnly ? '' : placeholder,
      rows: 1,
      readOnly,
      className: `${baseClass} ${extra} ${readOnly ? 'cursor-default' : ''}`,
    });

    switch (block.type) {
      case 'heading1':
        return <textarea {...taProps('text-3xl font-extrabold', '제목 1')} />;
      case 'heading2':
        return <textarea {...taProps('text-xl font-bold', '제목 2')} />;
      case 'heading3':
        return <textarea {...taProps('text-lg font-semibold', '제목 3')} />;
      case 'bullet':
        return (
          <div className="flex items-start gap-2">
            <span className="text-[#e94560] mt-1 select-none text-lg leading-none">•</span>
            <textarea {...taProps('text-sm flex-1', '리스트 항목')} />
          </div>
        );
      case 'numbered':
        return (
          <div className="flex items-start gap-2">
            <span className="text-[#8b5cf6] text-sm mt-0.5 select-none min-w-[1.5em] text-right font-bold">
              {(() => {
                if (!activeNote) return '1.';
                const idx = activeNote.blocks.filter((b) => b.type === 'numbered').findIndex((b) => b.id === block.id);
                return `${idx + 1}.`;
              })()}
            </span>
            <textarea {...taProps('text-sm flex-1', '번호 목록')} />
          </div>
        );
      case 'todo':
        return (
          <div className="flex items-start gap-3">
            <button
              onClick={() => toggleTodo(block.id)}
              className={`w-5 h-5 mt-0.5 rounded-md border-2 flex items-center justify-center transition-all duration-300 flex-shrink-0 ${block.checked ? 'bg-gradient-to-br from-[#e94560] to-[#533483] border-transparent' : 'hover:border-[#e94560]'}`}
              style={block.checked ? undefined : { borderColor: 'var(--color-checkbox-border)' }}
            >
              {block.checked && <svg width="10" height="10" viewBox="0 0 14 14" fill="none"><path d="M3 7L6 10L11 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            </button>
            <textarea {...taProps(`text-sm flex-1 ${block.checked ? 'line-through text-text-inactive' : ''}`, '할 일')} />
          </div>
        );
      case 'quote':
        return (
          <div className="flex items-stretch gap-0 bg-[#e94560]/5 rounded-r-lg py-1">
            <div className="w-[3px] bg-gradient-to-b from-[#e94560] to-[#533483] rounded-full flex-shrink-0 mr-3" />
            <textarea {...taProps('text-sm italic text-text-secondary flex-1 bg-transparent', '인용문')} />
          </div>
        );
      case 'divider':
        return <div className="py-2"><div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" /></div>;
      case 'code': {
        // First line may be a bare language identifier (e.g. "javascript")
        const firstLine = block.content.split('\n')[0] ?? '';
        const langHint = /^[a-zA-Z][a-zA-Z0-9+\-#]*$/.test(firstLine.trim()) && hljs.getLanguage(firstLine.trim().toLowerCase()) ? firstLine.trim().toLowerCase() : null;
        const codeBody = langHint ? block.content.slice(firstLine.length + 1) : block.content;
        let highlightedHtml = '';
        let detectedLang = langHint ?? 'code';
        try {
          if (langHint) {
            const r = hljs.highlight(codeBody, { language: langHint });
            highlightedHtml = r.value;
          } else if (codeBody.trim()) {
            const r = hljs.highlightAuto(codeBody);
            highlightedHtml = r.value;
            if (r.language) detectedLang = r.language;
          }
        } catch {
          highlightedHtml = codeBody.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }
        const isCodeEditing = !readOnly && editingCodeIds.has(block.id);
        return (
          <div className="bg-background-card border border-border rounded-lg relative">
            <div className="absolute top-2 right-2 text-[9px] text-text-inactive font-mono uppercase z-10">{detectedLang}</div>
            {isCodeEditing ? (
              <textarea
                data-block-id={block.id}
                autoFocus
                value={block.content}
                onChange={(e) => handleBlockInput(block.id, e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.stopPropagation(); if (e.key === 'Tab') { e.preventDefault(); updateBlock(block.id, block.content + '  '); } }}
                onBlur={() => setEditingCodeIds((prev) => { const n = new Set(prev); n.delete(block.id); return n; })}
                rows={Math.max(3, block.content.split('\n').length)}
                className={`${baseClass} w-full text-xs font-mono leading-relaxed resize-none p-3`}
              />
            ) : (
              <pre
                className={`p-3 text-xs font-mono leading-relaxed overflow-x-auto min-h-[4rem] ${!readOnly ? 'cursor-text' : ''}`}
                onClick={() => !readOnly && setEditingCodeIds((prev) => new Set([...prev, block.id]))}
              >
                <code
                  className="hljs"
                  dangerouslySetInnerHTML={{
                    __html: highlightedHtml || `<span style="opacity:0.4">${readOnly ? '' : '코드를 클릭해 편집… (첫 줄에 언어명 입력: javascript, python, tsx…)'}</span>`,
                  }}
                />
              </pre>
            )}
          </div>
        );
      }
      case 'link':
        return (
          <div className="flex items-center gap-2 p-2 bg-background-card border border-border rounded-lg group">
            <span className="text-[#3b82f6] flex-shrink-0">🔗</span>
            <textarea {...taProps('text-sm text-[#3b82f6] underline flex-1', '링크 제목')} />
            <input
              value={block.url ?? ''}
              onChange={(e) => updateBlockField(block.id, { url: e.target.value })}
              placeholder="https://..."
              className="text-[11px] text-text-muted bg-transparent outline-none border-l border-border pl-2 w-40 shrink-0"
            />
            {block.url && (
              <button
                onClick={() => window.open(block.url, '_blank', 'noopener,noreferrer')}
                className="text-[10px] px-2 py-0.5 bg-[#3b82f6]/20 text-[#3b82f6] rounded font-semibold flex-shrink-0"
              >
                열기
              </button>
            )}
          </div>
        );
      case 'toggle': {
        const subBlocks: SubBlock[] = block.subBlocks || [];
        const isOpen = openToggleIds.has(block.id);

        const addSubAfter = (afterId: string, inheritType: SubBlock['type'] = 'text') => {
          const newSub: SubBlock = {
            id: `${Date.now()}-sub-${Math.random().toString(36).substring(2, 6)}`,
            type: inheritType,
            content: '',
            ...(inheritType === 'todo' ? { checked: false } : {}),
          };
          const idx = subBlocks.findIndex((s) => s.id === afterId);
          const newSubs = [...subBlocks];
          if (idx >= 0) newSubs.splice(idx + 1, 0, newSub);
          else newSubs.push(newSub);
          updateBlockField(block.id, { subBlocks: newSubs });
          setTimeout(() => {
            document.querySelector<HTMLTextAreaElement>(`[data-sub-id="${newSub.id}"]`)?.focus();
          }, 50);
        };

        const updateSub = (subId: string, fields: Partial<SubBlock>) => {
          updateBlockField(block.id, { subBlocks: subBlocks.map((s) => s.id === subId ? { ...s, ...fields } : s) });
        };

        const deleteSub = (subId: string) => {
          const idx = subBlocks.findIndex((s) => s.id === subId);
          const newSubs = subBlocks.filter((s) => s.id !== subId);
          updateBlockField(block.id, { subBlocks: newSubs });
          if (newSubs.length === 0) return;
          const focusIdx = Math.max(0, idx - 1);
          setTimeout(() => {
            document.querySelector<HTMLTextAreaElement>(`[data-sub-id="${newSubs[focusIdx].id}"]`)?.focus();
          }, 50);
        };

        const addFirstSub = () => {
          const newSub: SubBlock = {
            id: `${Date.now()}-sub-${Math.random().toString(36).substring(2, 6)}`,
            type: 'text',
            content: '',
          };
          updateBlockField(block.id, { subBlocks: [newSub] });
          setTimeout(() => {
            document.querySelector<HTMLTextAreaElement>(`[data-sub-id="${newSub.id}"]`)?.focus();
          }, 50);
        };

        return (
          <div className="rounded-lg overflow-hidden border border-border">
            {/* Toggle header */}
            <div
              className="flex items-center gap-2 px-3 py-2 bg-background-card cursor-pointer group/toggle"
              onClick={() => setOpenToggleIds((prev) => {
                const next = new Set(prev);
                if (next.has(block.id)) next.delete(block.id); else next.add(block.id);
                return next;
              })}
            >
              <span className={`text-text-muted transition-transform text-xs ${isOpen ? 'rotate-90' : ''}`}>▶</span>
              <textarea
                data-block-id={block.id}
                value={block.content}
                onChange={(e) => { e.stopPropagation(); handleBlockInput(block.id, e.target.value); autoResize(e.target); }}
                onKeyDown={(e) => { e.stopPropagation(); handleBlockKeyDown(e, block); }}
                onClick={(e) => e.stopPropagation()}
                onFocus={(e) => autoResize(e.target)}
                placeholder="토글 제목..."
                rows={1}
                className={`${baseClass} text-sm font-semibold flex-1`}
              />
            </div>
            {/* Toggle body */}
            {isOpen && (
              <div className="border-t border-border/40 bg-background px-3 py-2 space-y-1">
                {subBlocks.length === 0 ? (
                  !readOnly && (
                    <p
                      className="text-sm text-text-muted/50 cursor-text py-1"
                      onClick={addFirstSub}
                    >
                      내용을 입력하세요...
                    </p>
                  )
                ) : (
                  <>
                    {subBlocks.map((sub, subIdx) => {
                      const subTextClass = (() => {
                        switch (sub.type) {
                          case 'heading2': return 'text-base font-bold';
                          case 'heading3': return 'text-sm font-semibold';
                          case 'quote': return 'text-sm italic';
                          case 'todo': return `text-sm ${sub.checked ? 'line-through text-text-muted' : ''}`;
                          default: return 'text-sm';
                        }
                      })();
                      return (
                        <div key={sub.id} className={`flex items-start gap-2 ${sub.type === 'quote' ? 'border-l-2 border-text-muted/30 pl-2' : ''}`}>
                          {sub.type === 'heading2' && <span className="text-[11px] font-bold text-text-muted flex-shrink-0 mt-1 min-w-[1.5rem]">H2</span>}
                          {sub.type === 'heading3' && <span className="text-[11px] font-bold text-text-muted flex-shrink-0 mt-1 min-w-[1.5rem]">H3</span>}
                          {sub.type === 'bullet' && <span className="text-text-muted flex-shrink-0 mt-1 text-base leading-tight">•</span>}
                          {sub.type === 'numbered' && <span className="text-xs text-text-muted flex-shrink-0 mt-1 min-w-[1.5rem]">{subIdx + 1}.</span>}
                          {sub.type === 'todo' && (
                            <input
                              type="checkbox"
                              checked={sub.checked ?? false}
                              onChange={() => updateSub(sub.id, { checked: !sub.checked })}
                              className="w-3.5 h-3.5 flex-shrink-0 cursor-pointer mt-1 accent-[#e94560]"
                            />
                          )}
                          <textarea
                            data-sub-id={sub.id}
                            value={sub.content}
                            readOnly={readOnly}
                            onChange={(e) => { updateSub(sub.id, { content: e.target.value }); autoResize(e.target); }}
                            onFocus={(e) => autoResize(e.target)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                const inheritType: SubBlock['type'] = ['bullet', 'numbered', 'todo'].includes(sub.type) ? sub.type as SubBlock['type'] : 'text';
                                addSubAfter(sub.id, inheritType);
                              }
                              if (e.key === 'Backspace' && sub.content === '') {
                                e.preventDefault();
                                deleteSub(sub.id);
                              }
                            }}
                            placeholder={subIdx === 0 ? '내용 입력...' : ''}
                            rows={1}
                            className={`flex-1 bg-transparent outline-none resize-none ${subTextClass} text-text-primary placeholder:text-text-muted/40 ${readOnly ? 'cursor-default' : ''}`}
                            style={{ maxHeight: '300px' }}
                          />
                        </div>
                      );
                    })}
                    {!readOnly && (
                      <button
                        onClick={() => addSubAfter(subBlocks[subBlocks.length - 1].id)}
                        className="text-[11px] text-text-muted/40 hover:text-text-muted flex items-center gap-1 mt-0.5 transition-colors"
                      >
                        + 블록 추가
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      }
      case 'image':
        return (
          <div className="my-2">
            {block.imageURL ? (
              <div className="relative group/img">
                <img src={block.imageURL} alt={block.content || 'image'} className="max-w-full rounded-lg border border-border" />
                {!readOnly && (
                  <button
                    onClick={() => updateBlockField(block.id, { imageURL: undefined, imagePath: undefined, content: '' })}
                    className="absolute top-2 right-2 opacity-0 group-hover/img:opacity-100 w-6 h-6 flex items-center justify-center bg-black/60 text-white rounded-full text-xs transition-opacity"
                  >
                    ×
                  </button>
                )}
                {!readOnly && (
                  <input
                    value={block.content}
                    onChange={(e) => updateBlockField(block.id, { content: e.target.value })}
                    placeholder="이미지 캡션..."
                    className={`${baseClass} text-xs text-text-muted text-center mt-1`}
                  />
                )}
              </div>
            ) : (
              <div className="border-2 border-dashed border-border rounded-lg p-6 text-center space-y-2">
                <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, block.id)} className="hidden" id={`img-${block.id}`} />
                <label htmlFor={`img-${block.id}`} className="cursor-pointer text-text-muted hover:text-text-primary text-sm block">
                  🖼 이미지를 선택하세요
                </label>
                <div className="flex items-center gap-2 max-w-xs mx-auto">
                  <input
                    type="text"
                    placeholder="또는 이미지 URL 붙여넣기..."
                    onKeyDown={(e) => { if (e.key === 'Enter') handleImageURL((e.target as HTMLInputElement).value, block.id); }}
                    className="flex-1 px-2.5 py-1.5 bg-background-card border border-border rounded text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-[#e94560]"
                  />
                </div>
              </div>
            )}
          </div>
        );
      default:
        return <textarea {...taProps('text-sm', '텍스트를 입력하세요... ( / 로 블록 타입 선택)')} />;
    }
  };

  // Close slash menu when clicking outside
  useEffect(() => {
    if (!slashMenuVisible) return;
    const handler = (e: MouseEvent) => {
      if (slashMenuRef.current && !slashMenuRef.current.contains(e.target as Node)) {
        setSlashMenuVisible(false);
        setSlashMenuBlockId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [slashMenuVisible]);

  // Close block type menu when clicking outside
  useEffect(() => {
    if (!blockTypeMenuId) return;
    const handler = (e: MouseEvent) => {
      if (blockTypeMenuRef.current && !blockTypeMenuRef.current.contains(e.target as Node)) {
        setBlockTypeMenuId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [blockTypeMenuId]);

  // Pointer drag: finalize reorder on pointerup
  useEffect(() => {
    if (dragBlockSrcIdx === null) return;
    const finish = () => {
      const src = dragSrcRef.current;
      const dst = dragDstRef.current;
      dragSrcRef.current = null;
      dragDstRef.current = null;
      setDragBlockSrcIdx(null);
      setDragBlockOverIdx(null);
      if (src === null || dst === null || src === dst) return;
      setNotes((prev) => {
        const cur = prev.find((n) => n.id === activeNoteId);
        if (cur) pushHistory(activeNoteId, cur.blocks, true);
        const updated = prev.map((n) => {
          if (n.id !== activeNoteId) return n;
          const blocks = [...n.blocks];
          const [moved] = blocks.splice(src, 1);
          blocks.splice(dst, 0, moved);
          return { ...n, blocks, updated_at: new Date().toISOString() };
        });
        const note = updated.find((n) => n.id === activeNoteId);
        if (note) debouncedSave(note);
        return updated;
      });
    };
    document.addEventListener('pointerup', finish);
    return () => document.removeEventListener('pointerup', finish);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragBlockSrcIdx]);

  // Body cursor while dragging
  useEffect(() => {
    if (dragBlockSrcIdx !== null) {
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    return () => { document.body.style.cursor = ''; document.body.style.userSelect = ''; };
  }, [dragBlockSrcIdx]);

  if (pageLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#e94560] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-text-secondary text-sm">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  // Tree data
  const pinnedNotes = searchFiltered.filter((n) => n.pinned);
  const folderNotes = (folderId: string) => searchFiltered.filter((n) => n.folderId === folderId && !n.pinned);

  // Get all descendant folder IDs (to prevent circular move)
  const getDescendantIds = (folderId: string): Set<string> => {
    const ids = new Set<string>();
    const addChildren = (parentId: string) => {
      folders.filter((f) => f.parentId === parentId).forEach((f) => {
        ids.add(f.id);
        addChildren(f.id);
      });
    };
    addChildren(folderId);
    return ids;
  };

  // Get folder path for breadcrumb
  const getFolderPath = (folderId: string | null): Folder[] => {
    if (!folderId) return [];
    const path: Folder[] = [];
    let current = folders.find((f) => f.id === folderId);
    while (current) {
      path.unshift(current);
      current = current.parentId ? folders.find((f) => f.id === current!.parentId) : undefined;
    }
    return path;
  };

  // Count all notes including sub-folder notes recursively
  const countFolderItems = (folderId: string): number => {
    const directNotes = searchFiltered.filter((n) => n.folderId === folderId && !n.pinned).length;
    const childFolders = folders.filter((f) => f.parentId === folderId);
    return directNotes + childFolders.length + childFolders.reduce((sum, cf) => sum + countFolderItems(cf.id), 0);
  };

  // Recursive folder tree renderer
  const renderFolderTree = (parentId: string | null, depth: number): React.ReactNode => {
    const foldersAtLevel = folders.filter((f) => (parentId === null ? !f.parentId : f.parentId === parentId));
    return foldersAtLevel.map((folder) => {
      const fNotes = folderNotes(folder.id);
      const childFolders = folders.filter((f) => f.parentId === folder.id);
      const isOpen = openFolderIds.has(folder.id);
      const isMovingThis = movingFolderId === folder.id;
      const itemCount = countFolderItems(folder.id);
      const indentPx = 12 + depth * 16;

      return (
        <div key={folder.id} className="mb-0.5">
          {/* Folder Header */}
          <div className="group flex items-center gap-1 py-1.5 hover:bg-background-card/60 transition-colors cursor-pointer rounded-lg mx-2" style={{ paddingLeft: `${indentPx}px`, paddingRight: '12px' }}>
            <button onClick={() => toggleFolder(folder.id)} className="flex items-center gap-1.5 flex-1 min-w-0">
              <span className={`text-text-muted transition-transform text-[10px] flex-shrink-0 ${isOpen ? 'rotate-90' : ''}`}>▶</span>
              <span className="text-sm flex-shrink-0">{folder.icon}</span>
              {editingFolderId === folder.id ? (
                <input
                  value={editingFolderName}
                  onChange={(e) => setEditingFolderName(e.target.value)}
                  onBlur={() => renameFolder(folder.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter') renameFolder(folder.id); if (e.key === 'Escape') setEditingFolderId(null); }}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                  className="flex-1 text-xs font-semibold bg-transparent outline-none border-b border-[#e94560] min-w-0"
                  style={{ color: folder.color }}
                />
              ) : (
                <span className="text-xs font-semibold truncate flex-1" style={{ color: folder.color }}
                  onDoubleClick={(e) => { e.stopPropagation(); setEditingFolderId(folder.id); setEditingFolderName(folder.name); }}>
                  {folder.name}
                </span>
              )}
              <span className="text-[10px] text-text-inactive flex-shrink-0">{itemCount}</span>
            </button>
            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 flex-shrink-0">
              <button onClick={(e) => { e.stopPropagation(); createNote(folder.id); if (!isOpen) toggleFolder(folder.id); }} className="w-5 h-5 flex items-center justify-center text-text-muted hover:text-[#22c55e] transition-all text-sm" title="노트 추가">+</button>
              <button onClick={(e) => { e.stopPropagation(); setCreatingSubfolderId(folder.id); setNewSubfolderName(''); }} className="w-5 h-5 flex items-center justify-center text-text-muted hover:text-[#8b5cf6] transition-all text-[10px]" title="하위폴더 추가">📁</button>
              {depth > 0 && <button onClick={(e) => { e.stopPropagation(); setMovingFolderId(isMovingThis ? null : folder.id); }} className="w-5 h-5 flex items-center justify-center text-text-muted hover:text-[#06b6d4] transition-all text-[10px]" title="이동">↕</button>}
              <button onClick={(e) => { e.stopPropagation(); deleteFolder(folder.id); }} className="w-5 h-5 flex items-center justify-center text-text-muted hover:text-[#e94560] transition-all text-xs" title="휴지통으로 이동">×</button>
            </div>
          </div>

          {/* Subfolder creation input */}
          {creatingSubfolderId === folder.id && (
            <div className="flex gap-1 py-1" style={{ paddingLeft: `${indentPx + 16}px`, paddingRight: '12px' }}>
              <input
                value={newSubfolderName}
                onChange={(e) => setNewSubfolderName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') createFolder(folder.id, newSubfolderName); if (e.key === 'Escape') setCreatingSubfolderId(null); }}
                placeholder="하위폴더 이름..."
                autoFocus
                className="flex-1 px-2 py-1 bg-background-card border border-[#8b5cf6]/40 rounded text-[11px] text-text-primary placeholder-text-muted focus:outline-none"
              />
              <button onClick={() => createFolder(folder.id, newSubfolderName)} className="px-2 py-1 bg-[#8b5cf6] text-white rounded text-[10px]">{t('common.add')}</button>
              <button onClick={() => setCreatingSubfolderId(null)} className="px-1 py-1 text-text-muted text-[10px]">{t('common.cancel')}</button>
            </div>
          )}

          {/* Move folder UI */}
          {isMovingThis && (
            <div className="mb-1 p-2 bg-background-card border border-[#06b6d4]/30 rounded-lg mx-3" style={{ marginLeft: `${indentPx + 8}px` }}>
              <p className="text-[10px] text-text-muted mb-1.5">이동할 위치 선택:</p>
              <button onClick={() => moveFolderTo(folder.id, null)} className="block w-full text-left text-[11px] text-text-secondary hover:text-text-primary py-0.5 px-1 rounded hover:bg-background-hover">📂 루트로 이동</button>
              {folders.filter((f) => f.id !== folder.id && !getDescendantIds(folder.id).has(f.id)).map((rf) => (
                <button key={rf.id} onClick={() => moveFolderTo(folder.id, rf.id)} className="block w-full text-left text-[11px] py-0.5 px-1 rounded hover:bg-background-hover" style={{ color: rf.color }}>
                  {rf.icon} {rf.name}
                </button>
              ))}
              <button onClick={() => setMovingFolderId(null)} className="text-[10px] text-text-muted mt-1">{t('common.cancel')}</button>
            </div>
          )}

          {/* Recursive child folders */}
          {isOpen && renderFolderTree(folder.id, depth + 1)}

          {/* Notes in this folder */}
          {isOpen && fNotes.map((note) => (
            <NoteTreeItem key={note.id} note={note} isActive={note.id === activeNoteId} onClick={() => setActiveNoteId(note.id)} onDelete={() => deleteNote(note.id)} onTogglePin={() => togglePin(note.id)} onToggleStar={() => toggleStar(note.id)} getRelativeTime={getRelativeTime} indent={depth + 1} />
          ))}
          {isOpen && fNotes.length === 0 && childFolders.length === 0 && (
            <p className="text-[11px] text-text-inactive py-0.5" style={{ paddingLeft: `${indentPx + 24}px` }}>{t('notes.noNotes')}</p>
          )}
        </div>
      );
    });
  };
  const unfolderNotes = searchFiltered.filter((n) => n.folderId === null && !n.pinned);

  return (
    <div className="flex h-full">
      {/* ================================================================ */}
      {/* Note List Panel */}
      {/* ================================================================ */}
      <div className={`border-r border-border bg-background flex flex-col flex-shrink-0 transition-all duration-200 ${activeNoteId ? 'hidden md:flex' : 'flex w-full'} ${listPanelCollapsed ? 'md:w-10' : 'md:w-72'}`}>
        {/* Header */}
        <div className={`p-4 border-b border-border ${listPanelCollapsed ? 'hidden md:flex md:flex-col md:items-center md:px-1' : ''}`}>
          {listPanelCollapsed ? (
            // 접힌 상태: 아이콘들만 세로로
            <div className="flex flex-col items-center gap-2">
              <button onClick={() => setListPanelCollapsed(false)} className="w-7 h-7 flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-border rounded transition-colors" title="목록 펼치기">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
              <span className="text-base">📝</span>
              <button onClick={() => createNote()} className="w-7 h-7 flex items-center justify-center bg-[#e94560] hover:bg-[#ff5a7a] text-white rounded-lg transition-colors text-sm" title="새 노트">+</button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📝</span>
                  <h2 className="text-lg font-bold text-text-primary">{t('notes.title')}</h2>
                  <span className="text-xs text-text-muted bg-border px-2 py-0.5 rounded-full">
                    {searchFiltered.length}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => createNote()}
                    className="w-8 h-8 flex items-center justify-center bg-[#e94560] hover:bg-[#ff5a7a] text-white rounded-lg transition-colors text-lg"
                  >
                    +
                  </button>
                  <button
                    onClick={() => setListPanelCollapsed(true)}
                    className="hidden md:flex w-7 h-7 items-center justify-center text-text-muted hover:text-text-primary hover:bg-border rounded transition-colors"
                    title="목록 접기"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                  </button>
                </div>
              </div>

          {/* Search */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('notes.search')}
              className="w-full pl-9 pr-3 py-2 bg-background-card border border-border rounded-lg text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-[#e94560] transition-colors"
            />
          </div>
            </>
          )}
        </div>

        {/* Tree List - 접힌 상태에서는 숨김 */}
        {!listPanelCollapsed && <div className="flex-1 overflow-y-auto py-2">
          {/* Pinned */}
          {pinnedNotes.length > 0 && (
            <div className="mb-1">
              <div className="text-[9px] text-text-muted uppercase tracking-widest font-semibold px-4 py-1">📌 {t('notes.pinned')}</div>
              {pinnedNotes.map((note) => (
                <NoteTreeItem
                  key={note.id}
                  note={note}
                  isActive={note.id === activeNoteId}
                  onClick={() => setActiveNoteId(note.id)}
                  onDelete={() => deleteNote(note.id)}
                  onTogglePin={() => togglePin(note.id)}
                  onToggleStar={() => toggleStar(note.id)}
                  getRelativeTime={getRelativeTime}
                  indent={0}
                />
              ))}
            </div>
          )}

          {/* Folder tree - recursive rendering */}
          {renderFolderTree(null, 0)}

          {/* Unfiled notes */}
          {unfolderNotes.length > 0 && (
            <div className="mt-1">
              {folders.length > 0 && (
                <div className="text-[9px] text-text-muted uppercase tracking-widest font-semibold px-4 py-1 mt-2">{t('notes.other')}</div>
              )}
              {unfolderNotes.map((note) => (
                <NoteTreeItem
                  key={note.id}
                  note={note}
                  isActive={note.id === activeNoteId}
                  onClick={() => setActiveNoteId(note.id)}
                  onDelete={() => deleteNote(note.id)}
                  onTogglePin={() => togglePin(note.id)}
                  onToggleStar={() => toggleStar(note.id)}
                  getRelativeTime={getRelativeTime}
                  indent={0}
                />
              ))}
            </div>
          )}

          {searchFiltered.length === 0 && (
            <div className="text-center py-12 text-text-muted text-sm">
              {searchQuery ? '검색 결과가 없습니다' : '노트가 없습니다'}
            </div>
          )}

          {/* New folder button */}
          <div className="px-3 mt-3">
            {showFolderCreator ? (
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && createFolder()}
                  placeholder="폴더 이름..."
                  autoFocus
                  className="flex-1 px-2.5 py-1.5 bg-background-card border border-border rounded-lg text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-[#e94560]"
                />
                <button onClick={() => createFolder()} className="px-2.5 py-1.5 bg-[#e94560] text-white rounded-lg text-[10px] font-semibold">{t('common.add')}</button>
                <button onClick={() => setShowFolderCreator(false)} className="px-2 py-1.5 text-text-muted text-[10px]">{t('common.cancel')}</button>
              </div>
            ) : (
              <button
                onClick={() => setShowFolderCreator(true)}
                className="text-[11px] text-text-inactive hover:text-text-secondary transition-colors flex items-center gap-1"
              >
                <span>+</span> {t('notes.newFolder')}
              </button>
            )}
          </div>

          {/* 휴지통 */}
          {(trashedFolders.length > 0 || trashedNotes.length > 0) && (
            <div className="px-3 mt-4 border-t border-border pt-3">
              <div className="flex items-center gap-1.5 w-full">
                <button
                  onClick={() => setShowTrash(!showTrash)}
                  className="flex items-center gap-1.5 text-[11px] text-text-muted hover:text-text-secondary transition-colors flex-1"
                >
                  <span className={`text-[9px] transition-transform ${showTrash ? 'rotate-90' : ''}`}>▶</span>
                  <span>🗑️ {t('notes.trash')}</span>
                  <span className="text-[10px] bg-border px-1.5 py-0.5 rounded-full">{trashedFolders.length + trashedNotes.length}</span>
                </button>
                {showTrash && (trashedFolders.length > 0 || trashedNotes.length > 0) && (
                  <button
                    onClick={emptyTrashFn}
                    className="text-[10px] text-[#e94560] hover:text-[#d63b55] transition-colors flex-shrink-0"
                  >
                    {t('notes.emptyTrash')}
                  </button>
                )}
              </div>
              {showTrash && (
                <div className="mt-1.5 space-y-1">
                  {trashedFolders.map((f) => (
                    <div key={f.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-background-card/50 group">
                      <span className="text-xs flex-shrink-0 opacity-50">{f.icon}</span>
                      <span className="text-[11px] text-text-muted truncate flex-1">{f.name}</span>
                      <button
                        onClick={() => restoreFolderFn(f.id)}
                        className="opacity-0 group-hover:opacity-100 text-[10px] text-[#22c55e] hover:text-[#16a34a] transition-all px-1.5 py-0.5 rounded border border-[#22c55e]/30 flex-shrink-0"
                        title={t('notes.restore')}
                      >
                        {t('notes.restore')}
                      </button>
                      <button
                        onClick={() => permanentDeleteFolderFn(f.id)}
                        className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center text-text-muted hover:text-[#e94560] transition-all text-xs flex-shrink-0"
                        title={t('notes.permanentDelete')}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {trashedNotes.map((n) => (
                    <div key={n.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-background-card/50 group">
                      <span className="text-xs flex-shrink-0 opacity-50">{n.icon}</span>
                      <span className="text-[11px] text-text-muted truncate flex-1">{n.title || t('notes.untitled')}</span>
                      <button
                        onClick={() => restoreNoteFn(n.id)}
                        className="opacity-0 group-hover:opacity-100 text-[10px] text-[#22c55e] hover:text-[#16a34a] transition-all px-1.5 py-0.5 rounded border border-[#22c55e]/30 flex-shrink-0"
                        title={t('notes.restore')}
                      >
                        {t('notes.restore')}
                      </button>
                      <button
                        onClick={() => permanentDeleteNoteFn(n.id)}
                        className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center text-text-muted hover:text-[#e94560] transition-all text-xs flex-shrink-0"
                        title={t('notes.permanentDelete')}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>}
      </div>

      {/* ================================================================ */}
      {/* Note Editor Panel */}
      {/* ================================================================ */}
      {activeNote ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Editor Toolbar */}
          <div className="border-b border-border bg-background/50">
            {/* Main toolbar row */}
            <div className="flex items-center justify-between px-4 md:px-6 py-2">
              <div className="flex items-center gap-2 md:gap-3 text-xs text-text-muted min-w-0">
                <button
                  onClick={() => setActiveNoteId('')}
                  className="md:hidden flex items-center text-text-secondary hover:text-text-primary transition-colors flex-shrink-0"
                  title="목록으로"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
                {activeNote.folderId && getFolderPath(activeNote.folderId).length > 0 && (
                  <>
                    <span className="hidden md:flex items-center gap-0.5 truncate">
                      {getFolderPath(activeNote.folderId).map((f, i) => (
                        <span key={f.id} className="flex items-center gap-0.5">
                          {i > 0 && <span className="text-text-inactive">/</span>}
                          <span style={{ color: f.color }}>{f.icon} {f.name}</span>
                        </span>
                      ))}
                    </span>
                    <span className="hidden md:inline text-text-inactive">·</span>
                  </>
                )}
                <span className="truncate hidden md:inline">수정됨 {getRelativeTime(activeNote.updated_at)}</span>
                <span className="hidden md:inline">·</span>
                <span className="hidden md:inline">{activeNote.blocks.length} 블록</span>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {/* Undo / Redo */}
                <button
                  onClick={undo}
                  disabled={!canUndo || readOnly}
                  title="되돌리기 (Ctrl+Z)"
                  className="w-7 h-7 flex items-center justify-center text-text-inactive hover:text-text-primary hover:bg-border rounded transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                </button>
                <button
                  onClick={redo}
                  disabled={!canRedo || readOnly}
                  title="다시 실행 (Ctrl+Shift+Z)"
                  className="w-7 h-7 flex items-center justify-center text-text-inactive hover:text-text-primary hover:bg-border rounded transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/></svg>
                </button>

                <div className="w-px h-4 bg-border mx-1" />

                {/* Read / Write toggle */}
                <button
                  onClick={() => setReadOnly(!readOnly)}
                  title={readOnly ? '쓰기 모드로 전환' : '읽기 모드로 전환'}
                  className={`h-7 px-2 md:px-2.5 flex items-center gap-1 md:gap-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                    readOnly
                      ? 'bg-[#8b5cf6]/15 text-[#8b5cf6] border border-[#8b5cf6]/30'
                      : 'bg-[#22c55e]/15 text-[#22c55e] border border-[#22c55e]/30'
                  }`}
                >
                  {readOnly ? (
                    <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg><span className="hidden md:inline"> 읽기</span></>
                  ) : (
                    <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg><span className="hidden md:inline"> 쓰기</span></>
                  )}
                </button>

                {/* AI Actions */}
                <div className="w-px h-4 bg-border mx-1" />
                <NoahAIPageActions
                  actions={[
                    { id: 'auto_write', label: '자동 작성', icon: '✍️', action: 'auto_write_note' as NoahAIAction, description: '제목으로 노트 자동 생성' },
                    { id: 'complete', label: '이어쓰기', icon: '📝', action: 'complete_note' as NoahAIAction, description: '현재 내용 이어서 작성' },
                    { id: 'youtube', label: 'YouTube → 노트', icon: '🎬', action: 'youtube_to_note' as NoahAIAction, description: '영상 요약 노트 생성' },
                  ]}
                  getContext={(action) => {
                    if (action === 'auto_write_note') {
                      return { title: activeNote.title, existingBlocks: activeNote.blocks.slice(0, 10) };
                    }
                    if (action === 'complete_note') {
                      return { title: activeNote.title, blocks: activeNote.blocks.slice(-15) };
                    }
                    return {};
                  }}
                  onResult={(action, result) => {
                    if (!result?.blocks || !activeNote) return;
                    const aiBlocks: NoteBlock[] = result.blocks.map((b: any, i: number) => ({
                      id: `${Date.now()}-ai-${i}`,
                      type: b.type || 'text',
                      content: b.content || '',
                    }));
                    if (aiBlocks.length === 0) return;

                    if (action === 'complete_note') {
                      // Append AI blocks after existing content
                      const updatedNote: Note = {
                        ...activeNote,
                        blocks: [...activeNote.blocks, ...aiBlocks],
                        updated_at: new Date().toISOString(),
                      };
                      setNotes((prev) => prev.map((n) => n.id === activeNote.id ? updatedNote : n));
                      saveNoteToFirestore(updatedNote);
                    } else {
                      // auto_write or youtube: replace empty blocks or set all blocks
                      const isEmpty = activeNote.blocks.length <= 1 && !activeNote.blocks[0]?.content?.trim();
                      const updatedNote: Note = {
                        ...activeNote,
                        title: result.title || activeNote.title,
                        blocks: isEmpty ? aiBlocks : [...activeNote.blocks, { id: `${Date.now()}-div`, type: 'divider' as const, content: '' }, ...aiBlocks],
                        updated_at: new Date().toISOString(),
                      };
                      setNotes((prev) => prev.map((n) => n.id === activeNote.id ? updatedNote : n));
                      saveNoteToFirestore(updatedNote);
                    }
                  }}
                />

                {/* Desktop: inline block type buttons */}
                {!readOnly && (
                  <>
                    <div className="w-px h-4 bg-border mx-1 hidden md:block" />
                    <div className="hidden md:flex items-center gap-0.5">
                      {[
                        { type: 'text' as const, label: 'T', title: '텍스트' },
                        { type: 'heading2' as const, label: 'H', title: '제목' },
                        { type: 'bullet' as const, label: '•', title: '글머리' },
                        { type: 'todo' as const, label: '☑', title: '할 일' },
                        { type: 'quote' as const, label: '"', title: '인용' },
                        { type: 'code' as const, label: '</>', title: '코드' },
                        { type: 'link' as const, label: '🔗', title: '링크 ([[)' },
                        { type: 'toggle' as const, label: '▶', title: '토글 (>>)' },
                        { type: 'image' as const, label: '🖼', title: '이미지' },
                        { type: 'divider' as const, label: '—', title: '구분선' },
                      ].map((item) => (
                        <button
                          key={item.type}
                          onClick={() => { const lastBlock = activeNote.blocks[activeNote.blocks.length - 1]; addBlockAfter(lastBlock.id, item.type); }}
                          title={item.title}
                          className="w-7 h-7 flex items-center justify-center text-text-inactive hover:text-text-primary hover:bg-border rounded transition-colors text-[11px] font-mono"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {/* Mobile: toggle toolbar button */}
                {!readOnly && (
                  <button
                    onClick={() => setShowMobileToolbar(!showMobileToolbar)}
                    className={`md:hidden w-7 h-7 flex items-center justify-center rounded transition-colors text-[11px] ${
                      showMobileToolbar ? 'bg-[#e94560]/15 text-[#e94560]' : 'text-text-inactive hover:text-text-primary hover:bg-border'
                    }`}
                    title="블록 추가"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  </button>
                )}

                {/* Folder move */}
                <div className="w-px h-4 bg-border mx-1 hidden md:block" />
                <select
                  value={activeNote.folderId || ''}
                  onChange={(e) => moveToFolder(activeNote.id, e.target.value || null)}
                  className="hidden md:block h-7 px-2 bg-background-card text-text-muted text-[10px] border border-border rounded-lg focus:outline-none cursor-pointer"
                >
                  <option value="">폴더 없음</option>
                  {folders.map((f) => (<option key={f.id} value={f.id}>{f.icon} {f.name}</option>))}
                </select>
              </div>
            </div>

            {/* Mobile expanded toolbar */}
            {showMobileToolbar && !readOnly && (
              <div className="md:hidden flex items-center gap-1 px-4 pb-2 flex-wrap">
                {[
                  { type: 'text' as const, label: 'T', title: '텍스트' },
                  { type: 'heading2' as const, label: 'H', title: '제목' },
                  { type: 'bullet' as const, label: '•', title: '글머리' },
                  { type: 'todo' as const, label: '☑', title: '할 일' },
                  { type: 'quote' as const, label: '"', title: '인용' },
                  { type: 'code' as const, label: '</>', title: '코드' },
                  { type: 'link' as const, label: '🔗', title: '링크' },
                  { type: 'toggle' as const, label: '▶', title: '토글' },
                  { type: 'image' as const, label: '🖼', title: '이미지' },
                  { type: 'divider' as const, label: '—', title: '구분선' },
                ].map((item) => (
                  <button
                    key={item.type}
                    onClick={() => { const lastBlock = activeNote.blocks[activeNote.blocks.length - 1]; addBlockAfter(lastBlock.id, item.type); setShowMobileToolbar(false); }}
                    className="h-8 px-2.5 flex items-center gap-1.5 text-text-inactive hover:text-text-primary bg-background-card hover:bg-border border border-border rounded-lg transition-colors text-[11px]"
                  >
                    <span className="font-mono">{item.label}</span>
                    <span className="text-[10px] text-text-muted">{item.title}</span>
                  </button>
                ))}
                <select
                  value={activeNote.folderId || ''}
                  onChange={(e) => moveToFolder(activeNote.id, e.target.value || null)}
                  className="h-8 px-2 bg-background-card text-text-muted text-[10px] border border-border rounded-lg focus:outline-none cursor-pointer"
                >
                  <option value="">폴더 없음</option>
                  {folders.map((f) => (<option key={f.id} value={f.id}>{f.icon} {f.name}</option>))}
                </select>
              </div>
            )}
          </div>

          {/* Editor Content */}
          <div className="flex-1 overflow-y-auto px-8 py-6">
            <div className="max-w-2xl mx-auto">
              {/* Icon + Title */}
              <div className="mb-6">
                <div className="relative inline-block mb-2">
                  <button onClick={() => !readOnly && setShowIconPicker(!showIconPicker)} className={`text-4xl transition-transform ${readOnly ? '' : 'hover:scale-110'}`}>
                    {activeNote.icon}
                  </button>
                  {showIconPicker && (
                    <div className="absolute top-12 left-0 bg-background-card border border-border rounded-xl p-3 shadow-xl z-10 min-w-[240px]">
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 36px)', gap: '4px' }}>
                        {NOTE_ICONS.map((icon) => (
                          <button key={icon} onClick={() => updateNoteIcon(icon)} style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', borderRadius: '8px' }} className="hover:bg-border transition-colors">{icon}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <input value={activeNote.title} onChange={(e) => updateNoteTitle(e.target.value)} placeholder="제목 없음" readOnly={readOnly} className={`w-full bg-transparent text-3xl font-extrabold text-text-primary placeholder-text-inactive outline-none ${readOnly ? 'cursor-default' : ''}`} />
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  {activeNote.tags.map((tag) => (
                    <span key={tag} className="px-2.5 py-0.5 bg-[#e94560]/10 text-[#e94560] text-[10px] font-semibold rounded-full border border-[#e94560]/20">{tag}</span>
                  ))}
                </div>
              </div>

              {/* Blocks with drag-and-drop */}
              <div className="space-y-0.5 relative">
                {activeNote.blocks.map((block, idx) => (
                  <div
                    key={block.id}
                    onPointerEnter={() => {
                      if (dragBlockSrcIdx !== null && idx !== dragBlockSrcIdx) {
                        dragDstRef.current = idx;
                        setDragBlockOverIdx(idx);
                      }
                    }}
                    className={`group relative py-1.5 rounded transition-colors ${
                      dragBlockSrcIdx === idx ? 'opacity-40 scale-95' :
                      dragBlockOverIdx === idx ? 'bg-[#e94560]/5 border border-dashed border-[#e94560]/30 rounded-lg' :
                      'hover:bg-white/[0.02]'
                    }`}
                  >
                    <div className="flex items-start gap-1">
                      {!readOnly && (
                        <div
                          onPointerDown={(e) => {
                            e.preventDefault();
                            dragSrcRef.current = idx;
                            setDragBlockSrcIdx(idx);
                          }}
                          className="hidden md:flex flex-shrink-0 items-center justify-center w-5 self-stretch opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing touch-none select-none"
                          title="드래그하여 순서 변경"
                        >
                          <span className="text-text-inactive text-[10px]">⋮⋮</span>
                        </div>
                      )}
                      {!readOnly && (
                        <div className="relative flex-shrink-0">
                          <button
                            onClick={() => setBlockTypeMenuId(blockTypeMenuId === block.id ? null : block.id)}
                            className="opacity-0 group-hover:opacity-100 active:opacity-100 transition-opacity w-6 h-6 flex items-center justify-center rounded text-text-inactive hover:text-text-secondary hover:bg-white/5 text-[10px] font-mono mt-0.5"
                            title="블록 타입 변경"
                          >
                            {SLASH_COMMANDS.find(c => c.type === block.type)?.icon ?? 'T'}
                          </button>
                          {blockTypeMenuId === block.id && (
                            <div
                              ref={blockTypeMenuRef}
                              className="absolute left-0 top-full z-50 mt-1 w-52 bg-background-card border border-border rounded-xl shadow-2xl overflow-y-auto"
                              style={{ maxHeight: '240px' }}
                            >
                              {SLASH_COMMANDS.map((cmd) => (
                                <button
                                  key={cmd.type}
                                  onClick={() => { changeBlockType(block.id, cmd.type); setBlockTypeMenuId(null); }}
                                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${block.type === cmd.type ? 'bg-[#e94560]/10 text-[#e94560]' : 'text-text-secondary hover:bg-background-hover'}`}
                                >
                                  <span className="w-6 h-6 flex items-center justify-center bg-border/50 rounded text-[10px] font-mono flex-shrink-0">{cmd.icon}</span>
                                  {cmd.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">{renderBlock(block)}</div>
                      {!readOnly && activeNote.blocks.length > 1 && (
                        <button
                          onClick={() => deleteBlock(block.id)}
                          className="flex-shrink-0 w-6 h-6 mt-0.5 flex items-center justify-center rounded-md text-text-inactive/50 hover:text-[#e94560] hover:bg-[#e94560]/10 active:text-[#e94560] active:bg-[#e94560]/10 transition-colors text-sm md:opacity-0 md:group-hover:opacity-100"
                          title="블록 삭제"
                        >
                          ×
                        </button>
                      )}
                    </div>

                    {/* Slash command menu - rendered relative to the active block */}
                    {slashMenuVisible && slashMenuBlockId === block.id && (
                      <div
                        ref={slashMenuRef}
                        className="absolute left-0 top-full z-50 mt-1 w-72 bg-background-card border border-border rounded-xl shadow-2xl overflow-hidden"
                        style={{ maxHeight: '280px' }}
                      >
                        <div className="p-2 border-b border-border">
                          <p className="text-[10px] text-text-muted font-semibold uppercase tracking-wider px-2">블록 타입 선택</p>
                        </div>
                        <div className="overflow-y-auto" style={{ maxHeight: '240px' }}>
                          {filteredSlashCommands.map((cmd, i) => (
                            <button
                              key={cmd.type}
                              onClick={() => selectSlashCommand(cmd.type)}
                              onMouseEnter={() => setSlashMenuIndex(i)}
                              className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                                slashMenuIndex === i ? 'bg-[#e94560]/10 text-[#e94560]' : 'text-text-secondary hover:bg-background-hover'
                              }`}
                            >
                              <span className="w-8 h-8 flex items-center justify-center bg-border/50 rounded-lg text-xs font-mono flex-shrink-0">
                                {cmd.icon}
                              </span>
                              <div>
                                <p className="text-xs font-semibold">{cmd.label}</p>
                                <p className="text-[10px] text-text-muted">{cmd.desc}</p>
                              </div>
                            </button>
                          ))}
                          {filteredSlashCommands.length === 0 && (
                            <p className="text-xs text-text-muted text-center py-4">일치하는 블록 타입이 없습니다</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Add block */}
              <button
                onClick={() => { const lastBlock = activeNote.blocks[activeNote.blocks.length - 1]; addBlockAfter(lastBlock.id); }}
                className="mt-4 w-full py-2 text-text-inactive hover:text-text-secondary text-sm text-left transition-colors"
              >
                {t('notes.newBlock')} &nbsp; <span className="text-[10px] opacity-50">Enter로도 추가 가능 · / 로 블록 타입 선택</span>
              </button>

              {/* Shortcuts hint */}
              <div className="mt-12 p-4 bg-background border border-border/50 rounded-xl">
                <div className="text-[10px] text-text-inactive uppercase tracking-wider font-semibold mb-3">{t('notes.shortcuts')}</div>
                <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 text-[11px] text-text-muted">
                  {[
                    { key: '/', desc: '블록 선택' }, { key: '#', desc: '제목 1' }, { key: '##', desc: '제목 2' },
                    { key: '###', desc: '제목 3' }, { key: '-', desc: '글머리' }, { key: '1.', desc: '번호' },
                    { key: '[]', desc: '체크리스트' }, { key: '>', desc: '인용문' }, { key: '---', desc: '구분선' },
                    { key: '```', desc: '코드' }, { key: '[[', desc: '링크' }, { key: '>>', desc: '토글' },
                  ].map((s, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <code className="px-1 py-0.5 bg-border/50 rounded text-[9px] text-[#e94560]/70 font-mono min-w-[2em] text-center">{s.key}</code>
                      <span>{s.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="text-6xl mb-4 animate-pulse-slow">📝</div>
            <p className="text-text-secondary font-semibold text-lg">{t('notes.selectNote')}</p>
            <p className="text-text-muted text-sm mt-1">{t('notes.orCreate')}</p>
            <button onClick={() => createNote()} className="mt-4 px-5 py-2.5 bg-[#e94560] hover:bg-[#ff5a7a] text-white font-semibold rounded-xl text-sm transition-colors">
              {t('notes.newNote')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function NotesPage() {
  return (
    <Suspense fallback={
      <div className="flex h-full items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#e94560] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <NotesContent />
    </Suspense>
  );
}

// ============================================================================
// Note Tree Item Component
// ============================================================================

function NoteTreeItem({
  note, isActive, onClick, onDelete, onTogglePin, onToggleStar, getRelativeTime, indent,
}: {
  note: Note; isActive: boolean; onClick: () => void; onDelete: () => void;
  onTogglePin: () => void; onToggleStar: () => void; getRelativeTime: (d: string) => string; indent: number;
}) {
  const preview = note.blocks.filter((b) => b.type !== 'divider' && b.content).slice(0, 1).map((b) => b.content).join('');
  return (
    <div
      onClick={onClick}
      className={`group relative flex items-center gap-2 py-1.5 pr-2 rounded-lg cursor-pointer transition-all mx-2 ${indent > 0 ? 'pl-8' : 'pl-3'} ${
        isActive ? 'bg-background-card border border-[#e94560]/30' : 'hover:bg-background-card/60 border border-transparent'
      }`}
    >
      <span className="text-base flex-shrink-0">{note.icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-text-primary truncate">{note.title}</p>
        {preview && <p className="text-[10px] text-text-muted truncate">{preview}</p>}
        <p className="text-[9px] text-text-muted">{getRelativeTime(note.updated_at)}</p>
      </div>
      <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 flex gap-0.5">
        <button onClick={(e) => { e.stopPropagation(); onToggleStar(); }} className={`w-5 h-5 flex items-center justify-center rounded text-[10px] ${note.starred ? 'text-amber-400' : 'text-text-muted hover:text-amber-400'}`}>{note.starred ? '★' : '☆'}</button>
        <button onClick={(e) => { e.stopPropagation(); onTogglePin(); }} className={`w-5 h-5 flex items-center justify-center rounded text-[10px] ${note.pinned ? 'text-[#e94560]' : 'text-text-muted hover:text-[#e94560]'}`}>📌</button>
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="w-5 h-5 flex items-center justify-center rounded text-text-muted hover:text-[#e94560] text-xs">×</button>
      </div>
    </div>
  );
}
