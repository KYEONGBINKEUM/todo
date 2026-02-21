'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n-context';
import {
  addNote as addNoteDB, updateNote as updateNoteDB, deleteNote as deleteNoteDB,
  addFolder as addFolderDB, deleteFolder as deleteFolderDB, updateFolder as updateFolderDB,
  restoreFolder as restoreFolderDB, permanentDeleteFolder as permanentDeleteFolderDB,
} from '@/lib/firestore';
import { useDataStore } from '@/lib/data-store';

// ============================================================================
// Types
// ============================================================================

interface NoteBlock {
  id: string;
  type: 'text' | 'heading1' | 'heading2' | 'heading3' | 'bullet' | 'numbered' | 'todo' | 'quote' | 'divider' | 'code' | 'link' | 'toggle';
  content: string;
  checked?: boolean;
  url?: string;
  children?: string;
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
  { type: 'divider' as const, icon: '—', label: '구분선', desc: '수평 구분선', keywords: 'divider line separator hr' },
];

// ============================================================================
// Component
// ============================================================================

function NotesContent() {
  const { user } = useAuth();
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const { notes: storeNotes, folders: storeFolders, loading: storeLoading } = useDataStore();
  const initializedRef = useRef(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [trashedFolders, setTrashedFolders] = useState<Folder[]>([]);
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

  // Undo / Redo history (per active note)
  const historyRef = useRef<Map<string, { past: NoteBlock[][]; future: NoteBlock[][] }>>(new Map());
  const skipHistoryRef = useRef(false);
  const historyTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSnapshotRef = useRef<string>(''); // JSON of last saved snapshot to avoid duplicates

  // Folder toggle tree
  const [openFolderIds, setOpenFolderIds] = useState<Set<string>>(new Set());
  // Toggle blocks
  const [openToggleIds, setOpenToggleIds] = useState<Set<string>>(new Set());

  // Block drag-and-drop state
  const [dragBlockSrcIdx, setDragBlockSrcIdx] = useState<number | null>(null);
  const [dragBlockOverIdx, setDragBlockOverIdx] = useState<number | null>(null);

  // Slash command menu state
  const [slashMenuVisible, setSlashMenuVisible] = useState(false);
  const [slashMenuBlockId, setSlashMenuBlockId] = useState<string | null>(null);
  const [slashMenuFilter, setSlashMenuFilter] = useState('');
  const [slashMenuIndex, setSlashMenuIndex] = useState(0);
  const slashMenuRef = useRef<HTMLDivElement>(null);

  // Initialize from global data store (once on first load)
  useEffect(() => {
    if (storeLoading || initializedRef.current) return;
    initializedRef.current = true;

    const mappedNotes: Note[] = storeNotes.map((n) => ({
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
    }));
    setNotes(mappedNotes);
    const paramNoteId = searchParams.get('note');
    if (paramNoteId && mappedNotes.find((n) => n.id === paramNoteId)) {
      setActiveNoteId(paramNoteId);
    } else if (mappedNotes.length > 0) {
      setActiveNoteId(mappedNotes[0].id);
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
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (activeNoteId === id) {
      const remaining = notes.filter((n) => n.id !== id);
      setActiveNoteId(remaining[0]?.id || '');
    }
    if (user) {
      try { await deleteNoteDB(user.uid, id); }
      catch (err) { console.error('Failed to delete note:', err); }
    }
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
                  ? { ...b, type: newType, ...(newType === 'todo' ? { checked: false } : {}), ...(newType === 'toggle' ? { children: '' } : {}), ...(newType === 'link' ? { url: '' } : {}) }
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
    return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  };

  // 자동 높이 조절 textarea 헬퍼
  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };

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
      case 'code':
        return (
          <div className="bg-background border border-border rounded-lg p-3 relative">
            <div className="absolute top-2 right-2 text-[9px] text-text-inactive font-mono">CODE</div>
            <textarea data-block-id={block.id} value={block.content} onChange={(e) => handleBlockInput(block.id, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.stopPropagation(); if (e.key === 'Tab') { e.preventDefault(); updateBlock(block.id, block.content + '  '); } }} placeholder="코드를 입력하세요..." rows={Math.max(3, block.content.split('\n').length)} className={`${baseClass} text-xs font-mono leading-relaxed resize-none`} />
          </div>
        );
      case 'link':
        return (
          <div className="flex items-center gap-2 p-2 bg-background border border-border rounded-lg group">
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
      case 'toggle':
        return (
          <div className="rounded-lg overflow-hidden border border-border/60">
            <div className="flex items-center gap-2 px-3 py-2 bg-background/50 cursor-pointer group/toggle" onClick={() => setOpenToggleIds((prev) => { const next = new Set(prev); if (next.has(block.id)) next.delete(block.id); else next.add(block.id); return next; })}>
              <span className={`text-text-muted transition-transform text-xs ${openToggleIds.has(block.id) ? 'rotate-90' : ''}`}>▶</span>
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
            {openToggleIds.has(block.id) && (
              <div className="px-3 py-2 border-t border-border/40 bg-background/20">
                <textarea
                  value={block.children ?? ''}
                  onChange={(e) => { updateBlockField(block.id, { children: e.target.value }); autoResize(e.target); }}
                  onFocus={(e) => autoResize(e.target)}
                  placeholder="내용을 입력하세요..."
                  rows={Math.max(2, (block.children ?? '').split('\n').length)}
                  className={`${baseClass} text-sm resize-none leading-relaxed`}
                />
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
  const unfolderNotes = searchFiltered.filter((n) => n.folderId === null && !n.pinned);

  return (
    <div className="flex h-full">
      {/* ================================================================ */}
      {/* Note List Panel */}
      {/* ================================================================ */}
      <div className={`border-r border-border bg-background flex flex-col flex-shrink-0 ${activeNoteId ? 'hidden md:flex md:w-72' : 'flex w-full md:w-72'}`}>
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">📝</span>
              <h2 className="text-lg font-bold text-text-primary">{t('notes.title')}</h2>
              <span className="text-xs text-text-muted bg-border px-2 py-0.5 rounded-full">
                {searchFiltered.length}
              </span>
            </div>
            <button
              onClick={() => createNote()}
              className="w-8 h-8 flex items-center justify-center bg-[#e94560] hover:bg-[#ff5a7a] text-white rounded-lg transition-colors text-lg"
            >
              +
            </button>
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
        </div>

        {/* Tree List */}
        <div className="flex-1 overflow-y-auto py-2">
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
                  getRelativeTime={getRelativeTime}
                  indent={0}
                />
              ))}
            </div>
          )}

          {/* Folder tree - 루트 폴더만 렌더링 (하위폴더는 내부에서) */}
          {folders.filter((f) => !f.parentId).map((folder) => {
            const fNotes = folderNotes(folder.id);
            const subFolders = folders.filter((f) => f.parentId === folder.id);
            const isOpen = openFolderIds.has(folder.id);
            const isMovingThis = movingFolderId === folder.id;
            const rootFolders = folders.filter((f) => !f.parentId && f.id !== folder.id);
            return (
              <div key={folder.id} className="mb-0.5">
                {/* Folder Header */}
                <div className="group flex items-center gap-1 px-3 py-1.5 hover:bg-background-card/60 transition-colors cursor-pointer rounded-lg mx-2">
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
                    <span className="text-[10px] text-text-inactive flex-shrink-0">{fNotes.length + subFolders.length}</span>
                  </button>
                  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 flex-shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); createNote(folder.id); if (!isOpen) toggleFolder(folder.id); }} className="w-5 h-5 flex items-center justify-center text-text-muted hover:text-[#22c55e] transition-all text-sm" title="노트 추가">+</button>
                    <button onClick={(e) => { e.stopPropagation(); setCreatingSubfolderId(folder.id); setNewSubfolderName(''); }} className="w-5 h-5 flex items-center justify-center text-text-muted hover:text-[#8b5cf6] transition-all text-[10px]" title="하위폴더 추가">📁</button>
                    <button onClick={(e) => { e.stopPropagation(); deleteFolder(folder.id); }} className="w-5 h-5 flex items-center justify-center text-text-muted hover:text-[#e94560] transition-all text-xs" title="휴지통으로 이동">×</button>
                  </div>
                </div>

                {/* 하위폴더 생성 인풋 */}
                {creatingSubfolderId === folder.id && (
                  <div className="flex gap-1 pl-8 pr-3 py-1">
                    <input
                      value={newSubfolderName}
                      onChange={(e) => setNewSubfolderName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') createFolder(folder.id, newSubfolderName); if (e.key === 'Escape') setCreatingSubfolderId(null); }}
                      placeholder="하위폴더 이름..."
                      autoFocus
                      className="flex-1 px-2 py-1 bg-background-card border border-[#8b5cf6]/40 rounded text-[11px] text-text-primary placeholder-text-muted focus:outline-none"
                    />
                    <button onClick={() => createFolder(folder.id, newSubfolderName)} className="px-2 py-1 bg-[#8b5cf6] text-white rounded text-[10px]">추가</button>
                    <button onClick={() => setCreatingSubfolderId(null)} className="px-1 py-1 text-text-muted text-[10px]">취소</button>
                  </div>
                )}

                {/* 폴더 내 하위폴더 */}
                {isOpen && subFolders.map((sub) => {
                  const subNotes = folderNotes(sub.id);
                  const isSubOpen = openFolderIds.has(sub.id);
                  const isMovingSub = movingFolderId === sub.id;
                  return (
                    <div key={sub.id} className="ml-4">
                      <div className="group flex items-center gap-1 px-3 py-1.5 hover:bg-background-card/60 transition-colors cursor-pointer rounded-lg mx-2">
                        <button onClick={() => toggleFolder(sub.id)} className="flex items-center gap-1.5 flex-1 min-w-0">
                          <span className={`text-text-muted transition-transform text-[10px] flex-shrink-0 ${isSubOpen ? 'rotate-90' : ''}`}>▶</span>
                          <span className="text-xs flex-shrink-0">{sub.icon}</span>
                          {editingFolderId === sub.id ? (
                            <input
                              value={editingFolderName}
                              onChange={(e) => setEditingFolderName(e.target.value)}
                              onBlur={() => renameFolder(sub.id)}
                              onKeyDown={(e) => { if (e.key === 'Enter') renameFolder(sub.id); if (e.key === 'Escape') setEditingFolderId(null); }}
                              onClick={(e) => e.stopPropagation()}
                              autoFocus
                              className="flex-1 text-xs font-semibold bg-transparent outline-none border-b border-[#e94560] min-w-0"
                              style={{ color: sub.color }}
                            />
                          ) : (
                            <span className="text-xs font-semibold truncate flex-1" style={{ color: sub.color }}
                              onDoubleClick={(e) => { e.stopPropagation(); setEditingFolderId(sub.id); setEditingFolderName(sub.name); }}>
                              {sub.name}
                            </span>
                          )}
                          <span className="text-[10px] text-text-inactive flex-shrink-0">{subNotes.length}</span>
                        </button>
                        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 flex-shrink-0">
                          <button onClick={(e) => { e.stopPropagation(); createNote(sub.id); if (!isSubOpen) toggleFolder(sub.id); }} className="w-5 h-5 flex items-center justify-center text-text-muted hover:text-[#22c55e] transition-all text-sm" title="노트 추가">+</button>
                          <button onClick={(e) => { e.stopPropagation(); setMovingFolderId(isMovingSub ? null : sub.id); }} className="w-5 h-5 flex items-center justify-center text-text-muted hover:text-[#06b6d4] transition-all text-[10px]" title="이동">↕</button>
                          <button onClick={(e) => { e.stopPropagation(); deleteFolder(sub.id); }} className="w-5 h-5 flex items-center justify-center text-text-muted hover:text-[#e94560] transition-all text-xs" title="휴지통으로 이동">×</button>
                        </div>
                      </div>
                      {/* 하위폴더 이동 UI */}
                      {isMovingSub && (
                        <div className="ml-6 mr-3 mb-1 p-2 bg-background-card border border-[#06b6d4]/30 rounded-lg">
                          <p className="text-[10px] text-text-muted mb-1.5">이동할 위치 선택:</p>
                          <button onClick={() => moveFolderTo(sub.id, null)} className="block w-full text-left text-[11px] text-text-secondary hover:text-text-primary py-0.5 px-1 rounded hover:bg-background-hover">📂 루트로 이동</button>
                          {rootFolders.filter((f) => f.id !== sub.id).map((rf) => (
                            <button key={rf.id} onClick={() => moveFolderTo(sub.id, rf.id)} className="block w-full text-left text-[11px] py-0.5 px-1 rounded hover:bg-background-hover" style={{ color: rf.color }}>
                              {rf.icon} {rf.name}
                            </button>
                          ))}
                          <button onClick={() => setMovingFolderId(null)} className="text-[10px] text-text-muted mt-1">취소</button>
                        </div>
                      )}
                      {isSubOpen && subNotes.map((note) => (
                        <NoteTreeItem key={note.id} note={note} isActive={note.id === activeNoteId} onClick={() => setActiveNoteId(note.id)} onDelete={() => deleteNote(note.id)} onTogglePin={() => togglePin(note.id)} getRelativeTime={getRelativeTime} indent={2} />
                      ))}
                      {isSubOpen && subNotes.length === 0 && <p className="text-[11px] text-text-inactive pl-16 py-0.5">{t('notes.noNotes')}</p>}
                    </div>
                  );
                })}

                {/* 폴더 내 노트 */}
                {isOpen && fNotes.map((note) => (
                  <NoteTreeItem key={note.id} note={note} isActive={note.id === activeNoteId} onClick={() => setActiveNoteId(note.id)} onDelete={() => deleteNote(note.id)} onTogglePin={() => togglePin(note.id)} getRelativeTime={getRelativeTime} indent={1} />
                ))}
                {isOpen && fNotes.length === 0 && subFolders.length === 0 && (
                  <p className="text-[11px] text-text-inactive pl-12 py-1">{t('notes.noNotes')}</p>
                )}
              </div>
            );
          })}

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
          {trashedFolders.length > 0 && (
            <div className="px-3 mt-4 border-t border-border pt-3">
              <button
                onClick={() => setShowTrash(!showTrash)}
                className="flex items-center gap-1.5 text-[11px] text-text-muted hover:text-text-secondary transition-colors w-full"
              >
                <span className={`text-[9px] transition-transform ${showTrash ? 'rotate-90' : ''}`}>▶</span>
                <span>🗑️ 휴지통</span>
                <span className="ml-auto text-[10px] bg-border px-1.5 py-0.5 rounded-full">{trashedFolders.length}</span>
              </button>
              {showTrash && (
                <div className="mt-1.5 space-y-1">
                  {trashedFolders.map((f) => (
                    <div key={f.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-background-card/50 group">
                      <span className="text-xs flex-shrink-0 opacity-50">{f.icon}</span>
                      <span className="text-[11px] text-text-muted truncate flex-1">{f.name}</span>
                      <button
                        onClick={() => restoreFolderFn(f.id)}
                        className="opacity-0 group-hover:opacity-100 text-[10px] text-[#22c55e] hover:text-[#16a34a] transition-all px-1.5 py-0.5 rounded border border-[#22c55e]/30 flex-shrink-0"
                        title="복원"
                      >
                        복원
                      </button>
                      <button
                        onClick={() => permanentDeleteFolderFn(f.id)}
                        className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center text-text-muted hover:text-[#e94560] transition-all text-xs flex-shrink-0"
                        title="영구 삭제"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* Note Editor Panel */}
      {/* ================================================================ */}
      {activeNote ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Editor Toolbar */}
          <div className="flex items-center justify-between px-6 py-2.5 border-b border-border bg-background/50">
            <div className="flex items-center gap-3 text-xs text-text-muted">
              <button
                onClick={() => setActiveNoteId('')}
                className="md:hidden flex items-center gap-1 text-text-secondary hover:text-text-primary transition-colors mr-1"
                title="목록으로"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <span>수정됨 {getRelativeTime(activeNote.updated_at)}</span>
              <span>·</span>
              <span>{activeNote.blocks.length} 블록</span>
            </div>
            <div className="flex items-center gap-1">
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
                className={`h-7 px-2.5 flex items-center gap-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                  readOnly
                    ? 'bg-[#8b5cf6]/15 text-[#8b5cf6] border border-[#8b5cf6]/30'
                    : 'bg-[#22c55e]/15 text-[#22c55e] border border-[#22c55e]/30'
                }`}
              >
                {readOnly ? (
                  <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> 읽기</>
                ) : (
                  <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> 쓰기</>
                )}
              </button>

              {!readOnly && (
                <>
                  <div className="w-px h-4 bg-border mx-1" />

                  {/* Block type buttons */}
                  {[
                    { type: 'text' as const, label: 'T', title: '텍스트' },
                    { type: 'heading2' as const, label: 'H', title: '제목' },
                    { type: 'bullet' as const, label: '•', title: '글머리' },
                    { type: 'todo' as const, label: '☑', title: '할 일' },
                    { type: 'quote' as const, label: '"', title: '인용' },
                    { type: 'code' as const, label: '</>', title: '코드' },
                    { type: 'link' as const, label: '🔗', title: '링크 ([[)' },
                    { type: 'toggle' as const, label: '▶', title: '토글 (>>)' },
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
                </>
              )}

              {/* Folder move */}
              <div className="w-px h-4 bg-border mx-1" />
              <select
                value={activeNote.folderId || ''}
                onChange={(e) => moveToFolder(activeNote.id, e.target.value || null)}
                className="h-7 px-2 bg-background-card text-text-muted text-[10px] border border-border rounded-lg focus:outline-none cursor-pointer"
              >
                <option value="">폴더 없음</option>
                {folders.map((f) => (<option key={f.id} value={f.id}>{f.icon} {f.name}</option>))}
              </select>
            </div>
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
                    draggable={!readOnly}
                    onDragStart={(e) => !readOnly && handleBlockDragStart(e, idx)}
                    onDragOver={(e) => !readOnly && handleBlockDragOver(e, idx)}
                    onDrop={(e) => !readOnly && handleBlockDrop(e, idx)}
                    onDragEnd={handleBlockDragEnd}
                    className={`group relative py-1.5 px-1 -mx-1 rounded transition-colors ${
                      dragBlockSrcIdx === idx ? 'opacity-40 scale-95' :
                      dragBlockOverIdx === idx ? 'bg-[#e94560]/5 border border-dashed border-[#e94560]/30 rounded-lg' :
                      'hover:bg-white/[0.02]'
                    }`}
                  >
                    {!readOnly && (
                      <div className="absolute -left-7 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity hidden md:flex items-center">
                        <span className="text-text-inactive text-[10px] cursor-grab active:cursor-grabbing">⋮⋮</span>
                      </div>
                    )}
                    <div className="flex items-start gap-1">
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
  note, isActive, onClick, onDelete, onTogglePin, getRelativeTime, indent,
}: {
  note: Note; isActive: boolean; onClick: () => void; onDelete: () => void;
  onTogglePin: () => void; getRelativeTime: (d: string) => string; indent: number;
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
        {preview && <p className="text-[10px] text-text-inactive truncate">{preview}</p>}
        <p className="text-[9px] text-text-inactive">{getRelativeTime(note.updated_at)}</p>
      </div>
      <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 flex gap-0.5">
        <button onClick={(e) => { e.stopPropagation(); onTogglePin(); }} className={`w-5 h-5 flex items-center justify-center rounded text-[10px] ${note.pinned ? 'text-[#e94560]' : 'text-text-muted hover:text-[#e94560]'}`}>📌</button>
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="w-5 h-5 flex items-center justify-center rounded text-text-muted hover:text-[#e94560] text-xs">×</button>
      </div>
    </div>
  );
}
