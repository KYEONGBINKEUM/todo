'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import {
  getNotes, addNote as addNoteDB, updateNote as updateNoteDB, deleteNote as deleteNoteDB,
  getFolders, addFolder as addFolderDB, deleteFolder as deleteFolderDB,
} from '@/lib/firestore';

// ============================================================================
// Types
// ============================================================================

interface NoteBlock {
  id: string;
  type: 'text' | 'heading1' | 'heading2' | 'heading3' | 'bullet' | 'numbered' | 'todo' | 'quote' | 'divider' | 'code' | 'link' | 'toggle';
  content: string;
  checked?: boolean;
  url?: string;       // link 블록용
  children?: string;  // toggle 블록 — 확장된 내용
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
}

interface Folder {
  id: string;
  name: string;
  color: string;
  icon: string;
}

const NOTE_ICONS = ['📋', '💬', '💡', '📝', '📖', '🎯', '🔬', '📊', '🗂️', '✏️', '🧠', '⚡'];

// ============================================================================
// Component
// ============================================================================

export default function NotesPage() {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showFolderCreator, setShowFolderCreator] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [showAITodoGuide, setShowAITodoGuide] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  // 폴더 토글 트리 상태 — 확장된 폴더 ID set
  const [openFolderIds, setOpenFolderIds] = useState<Set<string>>(new Set());
  // 토글 블록 — 확장된 블록 ID set (저장 불필요, UI 상태)
  const [openToggleIds, setOpenToggleIds] = useState<Set<string>>(new Set());

  // Load data
  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const [fetchedNotes, fetchedFolders] = await Promise.all([
        getNotes(user.uid),
        getFolders(user.uid),
      ]);
      const mappedNotes: Note[] = fetchedNotes.map((n) => ({
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
      }));
      setNotes(mappedNotes);
      if (mappedNotes.length > 0) setActiveNoteId(mappedNotes[0].id);
      const mappedFolders: Folder[] = fetchedFolders.map((f) => ({
        id: f.id!,
        name: f.name,
        color: f.color,
        icon: f.icon,
      }));
      setFolders(mappedFolders);
      // 모든 폴더 기본 확장
      setOpenFolderIds(new Set(mappedFolders.map((f) => f.id)));
    } catch (err) {
      console.error('Failed to load notes:', err);
    } finally {
      setPageLoading(false);
    }
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

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
      });
    } catch (err) {
      console.error('Failed to save note:', err);
    }
  }, [user]);

  const activeNote = notes.find((n) => n.id === activeNoteId);

  // Filtered notes for search
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

  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    const colors = ['#e94560', '#8b5cf6', '#06b6d4', '#22c55e', '#f59e0b', '#ec4899'];
    const icons = ['📁', '📂', '🗂️', '📦'];
    const tempId = Date.now().toString();
    const newFolder: Folder = {
      id: tempId,
      name: newFolderName.trim(),
      color: colors[folders.length % colors.length],
      icon: icons[folders.length % icons.length],
    };
    setFolders((prev) => [...prev, newFolder]);
    setOpenFolderIds((prev) => new Set([...prev, tempId]));
    setNewFolderName('');
    setShowFolderCreator(false);

    if (user) {
      try {
        const realId = await addFolderDB(user.uid, { name: newFolder.name, color: newFolder.color, icon: newFolder.icon });
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

  const deleteFolder = async (folderId: string) => {
    // 폴더 삭제: 해당 폴더의 노트 folderId → null (optimistic)
    setNotes((prev) =>
      prev.map((n) => n.folderId === folderId ? { ...n, folderId: null } : n)
    );
    setFolders((prev) => prev.filter((f) => f.id !== folderId));
    setOpenFolderIds((prev) => { const next = new Set(prev); next.delete(folderId); return next; });

    if (user) {
      try {
        // 폴더 내 노트 folderId 초기화
        const notesInFolder = notes.filter((n) => n.folderId === folderId);
        await Promise.all(notesInFolder.map((n) => updateNoteDB(user.uid, n.id, { folderId: null })));
        await deleteFolderDB(user.uid, folderId);
      } catch (err) {
        console.error('Failed to delete folder:', err);
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

  const TODO_KEYWORDS = ['해야', '하기', '예약', '미팅', '회의', '마감', '제출', '완료', '확인', '구매', '전화', '연락'];

  const updateBlock = (blockId: string, content: string) => {
    if (content.length > 5 && TODO_KEYWORDS.some((kw) => content.includes(kw))) {
      setShowAITodoGuide(true);
    }
    setNotes((prev) => {
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

  const handleBlockKeyDown = (e: React.KeyboardEvent, block: NoteBlock) => {
    if (e.key === 'Enter' && !e.shiftKey) {
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

  // ========== AI Mock ==========

  const triggerAIGenerate = () => {
    if (!activeNote) return;
    setAiGenerating(true);
    setTimeout(() => {
      const aiBlocks: NoteBlock[] = [
        { id: `ai-${Date.now()}-1`, type: 'divider', content: '' },
        { id: `ai-${Date.now()}-2`, type: 'heading3', content: '🤖 AI 추천 내용' },
        { id: `ai-${Date.now()}-3`, type: 'bullet', content: '다음 단계: 사용자 피드백 수집 계획 수립' },
        { id: `ai-${Date.now()}-4`, type: 'bullet', content: '위험 요소: 일정 지연 시 MVP 범위 축소 고려' },
        { id: `ai-${Date.now()}-5`, type: 'todo', content: 'AI 추천: 마일스톤 점검 회의 일정 잡기', checked: false },
      ];
      setNotes((prev) => {
        const updated = prev.map((n) =>
          n.id === activeNoteId ? { ...n, blocks: [...n.blocks, ...aiBlocks], updated_at: new Date().toISOString() } : n
        );
        const note = updated.find((n) => n.id === activeNoteId);
        if (note) saveNoteToFirestore(note);
        return updated;
      });
      setAiGenerating(false);
      setShowAIPanel(false);
    }, 2000);
  };

  const triggerAISummarize = () => {
    if (!activeNote) return;
    setAiGenerating(true);
    setTimeout(() => {
      const summaryBlocks: NoteBlock[] = [
        { id: `ai-${Date.now()}-1`, type: 'divider', content: '' },
        { id: `ai-${Date.now()}-2`, type: 'heading3', content: '📊 AI 요약' },
        { id: `ai-${Date.now()}-3`, type: 'quote', content: `이 노트는 "${activeNote.title}"에 관한 내용으로, ${activeNote.blocks.length}개의 블록으로 구성되어 있습니다.` },
      ];
      setNotes((prev) => {
        const updated = prev.map((n) =>
          n.id === activeNoteId ? { ...n, blocks: [...n.blocks, ...summaryBlocks], updated_at: new Date().toISOString() } : n
        );
        const note = updated.find((n) => n.id === activeNoteId);
        if (note) saveNoteToFirestore(note);
        return updated;
      });
      setAiGenerating(false);
      setShowAIPanel(false);
    }, 1500);
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

  const renderBlock = (block: NoteBlock) => {
    const baseClass = 'w-full bg-transparent outline-none resize-none text-text-primary placeholder-text-inactive';

    switch (block.type) {
      case 'heading1':
        return <input data-block-id={block.id} value={block.content} onChange={(e) => updateBlock(block.id, e.target.value)} onKeyDown={(e) => handleBlockKeyDown(e, block)} placeholder="제목 1" className={`${baseClass} text-3xl font-extrabold`} />;
      case 'heading2':
        return <input data-block-id={block.id} value={block.content} onChange={(e) => updateBlock(block.id, e.target.value)} onKeyDown={(e) => handleBlockKeyDown(e, block)} placeholder="제목 2" className={`${baseClass} text-xl font-bold`} />;
      case 'heading3':
        return <input data-block-id={block.id} value={block.content} onChange={(e) => updateBlock(block.id, e.target.value)} onKeyDown={(e) => handleBlockKeyDown(e, block)} placeholder="제목 3" className={`${baseClass} text-lg font-semibold`} />;
      case 'bullet':
        return (
          <div className="flex items-start gap-2">
            <span className="text-[#e94560] mt-1 select-none text-lg leading-none">•</span>
            <input data-block-id={block.id} value={block.content} onChange={(e) => updateBlock(block.id, e.target.value)} onKeyDown={(e) => handleBlockKeyDown(e, block)} placeholder="리스트 항목" className={`${baseClass} text-sm flex-1`} />
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
            <input data-block-id={block.id} value={block.content} onChange={(e) => updateBlock(block.id, e.target.value)} onKeyDown={(e) => handleBlockKeyDown(e, block)} placeholder="번호 목록" className={`${baseClass} text-sm flex-1`} />
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
            <input data-block-id={block.id} value={block.content} onChange={(e) => updateBlock(block.id, e.target.value)} onKeyDown={(e) => handleBlockKeyDown(e, block)} placeholder="할 일" className={`${baseClass} text-sm flex-1 ${block.checked ? 'line-through text-text-inactive' : ''}`} />
          </div>
        );
      case 'quote':
        return (
          <div className="flex items-stretch gap-0 bg-[#e94560]/5 rounded-r-lg py-1">
            <div className="w-[3px] bg-gradient-to-b from-[#e94560] to-[#533483] rounded-full flex-shrink-0 mr-3" />
            <input data-block-id={block.id} value={block.content} onChange={(e) => updateBlock(block.id, e.target.value)} onKeyDown={(e) => handleBlockKeyDown(e, block)} placeholder="인용문" className={`${baseClass} text-sm italic text-text-secondary flex-1 bg-transparent`} />
          </div>
        );
      case 'divider':
        return <div className="py-2"><div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" /></div>;
      case 'code':
        return (
          <div className="bg-background border border-border rounded-lg p-3 relative">
            <div className="absolute top-2 right-2 text-[9px] text-text-inactive font-mono">CODE</div>
            <textarea data-block-id={block.id} value={block.content} onChange={(e) => updateBlock(block.id, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.stopPropagation(); if (e.key === 'Tab') { e.preventDefault(); updateBlock(block.id, block.content + '  '); } }} placeholder="코드를 입력하세요..." rows={Math.max(3, block.content.split('\n').length)} className={`${baseClass} text-xs font-mono leading-relaxed resize-none`} />
          </div>
        );
      case 'link':
        return (
          <div className="flex items-center gap-2 p-2 bg-background border border-border rounded-lg group">
            <span className="text-[#3b82f6] flex-shrink-0">🔗</span>
            <input
              data-block-id={block.id}
              value={block.content}
              onChange={(e) => updateBlock(block.id, e.target.value)}
              onKeyDown={(e) => handleBlockKeyDown(e, block)}
              placeholder="링크 제목"
              className={`${baseClass} text-sm text-[#3b82f6] underline flex-1`}
            />
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
              <input
                data-block-id={block.id}
                value={block.content}
                onChange={(e) => { e.stopPropagation(); updateBlock(block.id, e.target.value); }}
                onKeyDown={(e) => { e.stopPropagation(); handleBlockKeyDown(e, block); }}
                onClick={(e) => e.stopPropagation()}
                placeholder="토글 제목..."
                className={`${baseClass} text-sm font-semibold flex-1`}
              />
            </div>
            {openToggleIds.has(block.id) && (
              <div className="px-3 py-2 border-t border-border/40 bg-background/20">
                <textarea
                  value={block.children ?? ''}
                  onChange={(e) => updateBlockField(block.id, { children: e.target.value })}
                  placeholder="내용을 입력하세요..."
                  rows={Math.max(2, (block.children ?? '').split('\n').length)}
                  className={`${baseClass} text-sm resize-none leading-relaxed`}
                />
              </div>
            )}
          </div>
        );
      default:
        return <input data-block-id={block.id} value={block.content} onChange={(e) => updateBlock(block.id, e.target.value)} onKeyDown={(e) => handleBlockKeyDown(e, block)} placeholder="텍스트를 입력하세요... (단축키: #, -, [], >, ---, [[, >>)" className={`${baseClass} text-sm`} />;
    }
  };

  if (pageLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#e94560] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-text-secondary text-sm">노트 불러오는 중...</p>
        </div>
      </div>
    );
  }

  // ── 트리 구조 데이터 빌드 ──────────────────────────────────────────────────
  const pinnedNotes = searchFiltered.filter((n) => n.pinned);
  const folderNotes = (folderId: string) => searchFiltered.filter((n) => n.folderId === folderId && !n.pinned);
  const unfolderNotes = searchFiltered.filter((n) => n.folderId === null && !n.pinned);

  return (
    <div className="flex h-screen">
      {/* ================================================================ */}
      {/* Note List Panel (트리 구조) */}
      {/* ================================================================ */}
      <div className="w-72 border-r border-border bg-background flex flex-col flex-shrink-0">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">📝</span>
              <h2 className="text-lg font-bold text-text-primary">노트</h2>
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
              placeholder="노트 검색..."
              className="w-full pl-9 pr-3 py-2 bg-background-card border border-border rounded-lg text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-[#e94560] transition-colors"
            />
          </div>
        </div>

        {/* Tree List */}
        <div className="flex-1 overflow-y-auto py-2">
          {/* 고정 노트 */}
          {pinnedNotes.length > 0 && (
            <div className="mb-1">
              <div className="text-[9px] text-text-muted uppercase tracking-widest font-semibold px-4 py-1">📌 고정됨</div>
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

          {/* 폴더 트리 */}
          {folders.map((folder) => {
            const fNotes = folderNotes(folder.id);
            const isOpen = openFolderIds.has(folder.id);
            return (
              <div key={folder.id} className="mb-0.5">
                {/* Folder Header */}
                <div className="group flex items-center gap-1.5 px-3 py-1.5 hover:bg-background-card/60 transition-colors cursor-pointer rounded-lg mx-2">
                  <button
                    onClick={() => toggleFolder(folder.id)}
                    className="flex items-center gap-1.5 flex-1 min-w-0"
                  >
                    <span className={`text-text-muted transition-transform text-[10px] flex-shrink-0 ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                    <span className="text-sm flex-shrink-0">{folder.icon}</span>
                    <span className="text-xs font-semibold truncate flex-1" style={{ color: folder.color }}>{folder.name}</span>
                    <span className="text-[10px] text-text-inactive flex-shrink-0">{fNotes.length}</span>
                  </button>
                  {/* 폴더 내 노트 추가 버튼 */}
                  <button
                    onClick={(e) => { e.stopPropagation(); createNote(folder.id); if (!isOpen) toggleFolder(folder.id); }}
                    className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center text-text-muted hover:text-[#e94560] transition-all text-sm"
                    title="이 폴더에 노트 추가"
                  >
                    +
                  </button>
                  {/* 폴더 삭제 */}
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteFolder(folder.id); }}
                    className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center text-text-muted hover:text-[#e94560] transition-all text-xs"
                    title="폴더 삭제"
                  >
                    ×
                  </button>
                </div>

                {/* Folder Notes */}
                {isOpen && fNotes.map((note) => (
                  <NoteTreeItem
                    key={note.id}
                    note={note}
                    isActive={note.id === activeNoteId}
                    onClick={() => setActiveNoteId(note.id)}
                    onDelete={() => deleteNote(note.id)}
                    onTogglePin={() => togglePin(note.id)}
                    getRelativeTime={getRelativeTime}
                    indent={1}
                  />
                ))}
                {isOpen && fNotes.length === 0 && (
                  <p className="text-[11px] text-text-inactive pl-12 py-1">노트 없음</p>
                )}
              </div>
            );
          })}

          {/* 폴더 없는 노트 */}
          {unfolderNotes.length > 0 && (
            <div className="mt-1">
              {folders.length > 0 && (
                <div className="text-[9px] text-text-muted uppercase tracking-widest font-semibold px-4 py-1 mt-2">기타</div>
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

          {/* 새 폴더 버튼 */}
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
                <button onClick={createFolder} className="px-2.5 py-1.5 bg-[#e94560] text-white rounded-lg text-[10px] font-semibold">추가</button>
                <button onClick={() => setShowFolderCreator(false)} className="px-2 py-1.5 text-text-muted text-[10px]">취소</button>
              </div>
            ) : (
              <button
                onClick={() => setShowFolderCreator(true)}
                className="text-[11px] text-text-inactive hover:text-text-secondary transition-colors flex items-center gap-1"
              >
                <span>+</span> 새 폴더
              </button>
            )}
          </div>
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
              <span>수정됨 {getRelativeTime(activeNote.updated_at)}</span>
              <span>·</span>
              <span>{activeNote.blocks.length} 블록</span>
            </div>
            <div className="flex items-center gap-1">
              {/* AI Button */}
              <button onClick={() => setShowAIPanel(!showAIPanel)} title="AI 도우미" className="h-7 px-2 flex items-center gap-1 text-text-muted hover:text-[#8b5cf6] hover:bg-[#8b5cf6]/10 rounded-lg transition-all text-xs">
                <span>🧠</span>
                <span className="text-[10px]">AI</span>
                <span className="px-1 py-0 rounded text-[8px] font-bold bg-gradient-to-r from-amber-500 to-red-500 text-white leading-tight">PRO</span>
              </button>

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

          {/* AI Todo Guide Banner */}
          {showAITodoGuide && (
            <div className="px-6 py-3 border-b border-border bg-gradient-to-r from-[#8b5cf6]/5 to-[#e94560]/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm">🤖</span>
                  <span className="text-xs text-text-secondary">노트 내용을 분석하여 <strong className="text-text-primary">할일 목록에 추가해드릴까요?</strong></span>
                  <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-gradient-to-r from-amber-500 to-red-500 text-white">PREMIUM</span>
                </div>
                <div className="flex items-center gap-2">
                  <button className="px-3 py-1.5 bg-[#8b5cf6] text-white rounded-lg text-[10px] font-semibold opacity-50 cursor-not-allowed">업그레이드</button>
                  <button onClick={() => setShowAITodoGuide(false)} className="text-text-inactive hover:text-text-secondary text-sm">×</button>
                </div>
              </div>
            </div>
          )}

          {/* AI Panel */}
          {showAIPanel && (
            <div className="px-6 py-3 border-b border-border bg-[#8b5cf6]/5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm">🧠</span>
                <span className="text-xs font-bold text-[#8b5cf6]">AI 도우미</span>
                <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-gradient-to-r from-amber-500 to-red-500 text-white">PREMIUM</span>
              </div>
              {aiGenerating ? (
                <div className="flex items-center gap-2 py-2">
                  <div className="flex gap-1">
                    {[0, 150, 300].map((d) => <div key={d} className="w-1.5 h-1.5 rounded-full bg-[#8b5cf6] animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
                  </div>
                  <span className="text-xs text-[#8b5cf6]">AI가 분석 중입니다...</span>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { icon: '✨', label: '자동 작성', fn: triggerAIGenerate },
                    { icon: '📊', label: '요약하기', fn: triggerAISummarize },
                    { icon: '⚡', label: '액션 추출', fn: () => { setAiGenerating(true); setTimeout(() => { setAiGenerating(false); setShowAIPanel(false); }, 1800); } },
                  ].map((btn) => (
                    <button key={btn.label} onClick={btn.fn} className="p-2.5 bg-background-card border border-border rounded-lg text-center hover:border-[#8b5cf6]/30 transition-all group">
                      <span className="text-lg block mb-1">{btn.icon}</span>
                      <span className="text-[10px] text-text-secondary group-hover:text-text-primary">{btn.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Editor Content */}
          <div className="flex-1 overflow-y-auto px-8 py-6">
            <div className="max-w-2xl mx-auto">
              {/* Icon + Title */}
              <div className="mb-6">
                <div className="relative inline-block mb-2">
                  <button onClick={() => setShowIconPicker(!showIconPicker)} className="text-4xl hover:scale-110 transition-transform">
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
                <input value={activeNote.title} onChange={(e) => updateNoteTitle(e.target.value)} placeholder="제목 없음" className="w-full bg-transparent text-3xl font-extrabold text-text-primary placeholder-text-inactive outline-none" />
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  {activeNote.tags.map((tag) => (
                    <span key={tag} className="px-2.5 py-0.5 bg-[#e94560]/10 text-[#e94560] text-[10px] font-semibold rounded-full border border-[#e94560]/20">{tag}</span>
                  ))}
                </div>
              </div>

              {/* Blocks */}
              <div className="space-y-0.5">
                {activeNote.blocks.map((block) => (
                  <div key={block.id} className="group relative py-1.5 px-1 -mx-1 rounded hover:bg-white/[0.02] transition-colors">
                    <div className="absolute -left-7 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-text-inactive cursor-grab text-[10px]">⋮⋮</span>
                    </div>
                    {renderBlock(block)}
                  </div>
                ))}
              </div>

              {/* Add block */}
              <button
                onClick={() => { const lastBlock = activeNote.blocks[activeNote.blocks.length - 1]; addBlockAfter(lastBlock.id); }}
                className="mt-4 w-full py-2 text-text-inactive hover:text-text-secondary text-sm text-left transition-colors"
              >
                + 새 블록 &nbsp; <span className="text-[10px] opacity-50">Enter로도 추가 가능</span>
              </button>

              {/* Shortcuts hint */}
              <div className="mt-12 p-4 bg-background border border-border/50 rounded-xl">
                <div className="text-[10px] text-text-inactive uppercase tracking-wider font-semibold mb-3">단축키</div>
                <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 text-[11px] text-text-muted">
                  {[
                    { key: '#', desc: '제목 1' }, { key: '##', desc: '제목 2' }, { key: '###', desc: '제목 3' },
                    { key: '-', desc: '글머리' }, { key: '1.', desc: '번호' }, { key: '[]', desc: '체크리스트' },
                    { key: '>', desc: '인용문' }, { key: '---', desc: '구분선' }, { key: '```', desc: '코드' },
                    { key: '[[', desc: '링크' }, { key: '>>', desc: '토글' }, { key: '', desc: '' },
                  ].filter(s => s.key || s.desc).map((s, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      {s.key && <code className="px-1 py-0.5 bg-border/50 rounded text-[9px] text-[#e94560]/70 font-mono min-w-[2em] text-center">{s.key}</code>}
                      <span>{s.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-6xl mb-4 animate-pulse-slow">📝</div>
            <p className="text-text-secondary font-semibold text-lg">노트를 선택하세요</p>
            <p className="text-text-muted text-sm mt-1">또는 새 노트를 만들어보세요</p>
            <button onClick={() => createNote()} className="mt-4 px-5 py-2.5 bg-[#e94560] hover:bg-[#ff5a7a] text-white font-semibold rounded-xl text-sm transition-colors">
              + 새 노트 만들기
            </button>
          </div>
        </div>
      )}
    </div>
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
