'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import {
  getNotes, addNote as addNoteDB, updateNote as updateNoteDB, deleteNote as deleteNoteDB,
  getFolders, addFolder as addFolderDB,
} from '@/lib/firestore';

// ============================================================================
// Types
// ============================================================================

interface NoteBlock {
  id: string;
  type: 'text' | 'heading1' | 'heading2' | 'heading3' | 'bullet' | 'numbered' | 'todo' | 'quote' | 'divider' | 'code';
  content: string;
  checked?: boolean;
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
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showFolderCreator, setShowFolderCreator] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [showAITodoGuide, setShowAITodoGuide] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  // Load data from Firestore
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
    } catch (err) {
      console.error('Failed to load notes:', err);
    } finally {
      setPageLoading(false);
    }
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-save note to Firestore (debounced via state updates)
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

  // Filter notes
  const filteredNotes = notes
    .filter((n) => activeFolderId === null || n.folderId === activeFolderId)
    .filter(
      (n) =>
        !searchQuery ||
        n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.blocks.some((b) => b.content.toLowerCase().includes(searchQuery.toLowerCase()))
    );

  const pinnedNotes = filteredNotes.filter((n) => n.pinned);
  const otherNotes = filteredNotes.filter((n) => !n.pinned);

  // ========== Auto-save debounce ==========
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const debouncedSave = useCallback((note: Note) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveNoteToFirestore(note);
    }, 400);
  }, [saveNoteToFirestore]);

  // ========== Note CRUD ==========

  const createNote = async () => {
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
      folderId: activeFolderId,
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
      try {
        await deleteNoteDB(user.uid, id);
      } catch (err) {
        console.error('Failed to delete note:', err);
      }
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
    setNewFolderName('');
    setShowFolderCreator(false);

    if (user) {
      try {
        const realId = await addFolderDB(user.uid, {
          name: newFolder.name,
          color: newFolder.color,
          icon: newFolder.icon,
        });
        setFolders((prev) => prev.map((f) => f.id === tempId ? { ...f, id: realId } : f));
      } catch (err) {
        console.error('Failed to create folder:', err);
      }
    }
  };

  // ========== Block Operations ==========

  // Simple heuristic: detect task-like content to show AI guide
  const TODO_KEYWORDS = ['해야', '하기', '예약', '미팅', '회의', '마감', '제출', '완료', '확인', '구매', '전화', '연락'];

  const updateBlock = (blockId: string, content: string) => {
    // Check if content looks like a task
    if (content.length > 5 && TODO_KEYWORDS.some((kw) => content.includes(kw))) {
      setShowAITodoGuide(true);
    }
    setNotes((prev) => {
      const updated = prev.map((n) =>
        n.id === activeNoteId
          ? {
              ...n,
              updated_at: new Date().toISOString(),
              blocks: n.blocks.map((b) => (b.id === blockId ? { ...b, content } : b)),
            }
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
                  ? { ...b, type: newType, ...(newType === 'todo' ? { checked: false } : {}) }
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
      const content = block.content;
      if (content === '#') { changeBlockType(block.id, 'heading1'); updateBlock(block.id, ''); e.preventDefault(); }
      else if (content === '##') { changeBlockType(block.id, 'heading2'); updateBlock(block.id, ''); e.preventDefault(); }
      else if (content === '###') { changeBlockType(block.id, 'heading3'); updateBlock(block.id, ''); e.preventDefault(); }
      else if (content === '-' || content === '*') { changeBlockType(block.id, 'bullet'); updateBlock(block.id, ''); e.preventDefault(); }
      else if (content === '1.') { changeBlockType(block.id, 'numbered'); updateBlock(block.id, ''); e.preventDefault(); }
      else if (content === '[]' || content === '[ ]') { changeBlockType(block.id, 'todo'); updateBlock(block.id, ''); e.preventDefault(); }
      else if (content === '>') { changeBlockType(block.id, 'quote'); updateBlock(block.id, ''); e.preventDefault(); }
      else if (content === '---') { changeBlockType(block.id, 'divider'); updateBlock(block.id, ''); e.preventDefault(); }
      else if (content === '```') { changeBlockType(block.id, 'code'); updateBlock(block.id, ''); e.preventDefault(); }
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
          n.id === activeNoteId
            ? { ...n, blocks: [...n.blocks, ...aiBlocks], updated_at: new Date().toISOString() }
            : n
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
        { id: `ai-${Date.now()}-3`, type: 'quote', content: `이 노트는 "${activeNote.title}"에 관한 내용으로, ${activeNote.blocks.length}개의 블록으로 구성되어 있습니다. 핵심 키워드: ${activeNote.tags.join(', ') || '없음'}` },
      ];

      setNotes((prev) => {
        const updated = prev.map((n) =>
          n.id === activeNoteId
            ? { ...n, blocks: [...n.blocks, ...summaryBlocks], updated_at: new Date().toISOString() }
            : n
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
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return '방금 전';
    if (diffMins < 60) return `${diffMins}분 전`;
    if (diffHours < 24) return `${diffHours}시간 전`;
    if (diffDays < 7) return `${diffDays}일 전`;
    return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  };

  const getFolderInfo = (folderId: string | null) =>
    folders.find((f) => f.id === folderId);

  const renderBlock = (block: NoteBlock) => {
    const baseClass = 'w-full bg-transparent outline-none resize-none text-[#e2e8f0] placeholder-[#4a4a6a]';

    switch (block.type) {
      case 'heading1':
        return (
          <input
            data-block-id={block.id}
            value={block.content}
            onChange={(e) => updateBlock(block.id, e.target.value)}
            onKeyDown={(e) => handleBlockKeyDown(e, block)}
            placeholder="제목 1"
            className={`${baseClass} text-3xl font-extrabold`}
          />
        );
      case 'heading2':
        return (
          <input
            data-block-id={block.id}
            value={block.content}
            onChange={(e) => updateBlock(block.id, e.target.value)}
            onKeyDown={(e) => handleBlockKeyDown(e, block)}
            placeholder="제목 2"
            className={`${baseClass} text-xl font-bold`}
          />
        );
      case 'heading3':
        return (
          <input
            data-block-id={block.id}
            value={block.content}
            onChange={(e) => updateBlock(block.id, e.target.value)}
            onKeyDown={(e) => handleBlockKeyDown(e, block)}
            placeholder="제목 3"
            className={`${baseClass} text-lg font-semibold`}
          />
        );
      case 'bullet':
        return (
          <div className="flex items-start gap-2">
            <span className="text-[#e94560] mt-1 select-none text-lg leading-none">•</span>
            <input
              data-block-id={block.id}
              value={block.content}
              onChange={(e) => updateBlock(block.id, e.target.value)}
              onKeyDown={(e) => handleBlockKeyDown(e, block)}
              placeholder="리스트 항목"
              className={`${baseClass} text-sm flex-1`}
            />
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
            <input
              data-block-id={block.id}
              value={block.content}
              onChange={(e) => updateBlock(block.id, e.target.value)}
              onKeyDown={(e) => handleBlockKeyDown(e, block)}
              placeholder="번호 목록"
              className={`${baseClass} text-sm flex-1`}
            />
          </div>
        );
      case 'todo':
        return (
          <div className="flex items-start gap-3">
            <button
              onClick={() => toggleTodo(block.id)}
              className={`w-5 h-5 mt-0.5 rounded-md border-2 flex items-center justify-center transition-all duration-300 flex-shrink-0 ${
                block.checked
                  ? 'bg-gradient-to-br from-[#e94560] to-[#533483] border-transparent'
                  : 'border-[#4a4a6a] hover:border-[#e94560] hover:shadow-[0_0_6px_rgba(233,69,96,0.3)]'
              }`}
            >
              {block.checked && (
                <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
                  <path d="M3 7L6 10L11 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
            <input
              data-block-id={block.id}
              value={block.content}
              onChange={(e) => updateBlock(block.id, e.target.value)}
              onKeyDown={(e) => handleBlockKeyDown(e, block)}
              placeholder="할 일"
              className={`${baseClass} text-sm flex-1 ${block.checked ? 'line-through text-[#4a4a6a]' : ''}`}
            />
          </div>
        );
      case 'quote':
        return (
          <div className="flex items-stretch gap-0 bg-[#e94560]/5 rounded-r-lg py-1">
            <div className="w-[3px] bg-gradient-to-b from-[#e94560] to-[#533483] rounded-full flex-shrink-0 mr-3" />
            <input
              data-block-id={block.id}
              value={block.content}
              onChange={(e) => updateBlock(block.id, e.target.value)}
              onKeyDown={(e) => handleBlockKeyDown(e, block)}
              placeholder="인용문"
              className={`${baseClass} text-sm italic text-[#94a3b8] flex-1 bg-transparent`}
            />
          </div>
        );
      case 'divider':
        return (
          <div className="py-2">
            <div className="h-px bg-gradient-to-r from-transparent via-[#1e1e3a] to-transparent" />
          </div>
        );
      case 'code':
        return (
          <div className="bg-[#0a0a1f] border border-[#1e1e3a] rounded-lg p-3 relative">
            <div className="absolute top-2 right-2 text-[9px] text-[#4a4a6a] font-mono">CODE</div>
            <textarea
              data-block-id={block.id}
              value={block.content}
              onChange={(e) => updateBlock(block.id, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.stopPropagation();
                if (e.key === 'Tab') {
                  e.preventDefault();
                  updateBlock(block.id, block.content + '  ');
                }
              }}
              placeholder="코드를 입력하세요..."
              rows={Math.max(3, block.content.split('\n').length)}
              className={`${baseClass} text-xs font-mono leading-relaxed resize-none`}
            />
          </div>
        );
      default:
        return (
          <input
            data-block-id={block.id}
            value={block.content}
            onChange={(e) => updateBlock(block.id, e.target.value)}
            onKeyDown={(e) => handleBlockKeyDown(e, block)}
            placeholder="텍스트를 입력하세요... (마크다운 단축키: #, -, [], >, ---)"
            className={`${baseClass} text-sm`}
          />
        );
    }
  };

  if (pageLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#e94560] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#94a3b8] text-sm">노트 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {/* ================================================================ */}
      {/* Note List Panel */}
      {/* ================================================================ */}
      <div className="w-80 border-r border-[#1e1e3a] bg-[#0d0d20] flex flex-col flex-shrink-0">
        {/* Header */}
        <div className="p-4 border-b border-[#1e1e3a]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">📝</span>
              <h2 className="text-lg font-bold">노트</h2>
              <span className="text-xs text-[#64748b] bg-[#1e1e3a] px-2 py-0.5 rounded-full">
                {filteredNotes.length}
              </span>
            </div>
            <button
              onClick={createNote}
              className="w-8 h-8 flex items-center justify-center bg-[#e94560] hover:bg-[#ff5a7a] text-white rounded-lg transition-colors text-lg"
            >
              +
            </button>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#64748b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="노트 검색..."
              className="w-full pl-9 pr-3 py-2 bg-[#111128] border border-[#1e1e3a] rounded-lg text-xs text-[#e2e8f0] placeholder-[#64748b] focus:outline-none focus:border-[#e94560] transition-colors"
            />
          </div>

          {/* Folder Tabs */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setActiveFolderId(null)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                activeFolderId === null
                  ? 'bg-[#e94560]/15 text-[#e94560] border border-[#e94560]/30'
                  : 'text-[#94a3b8] hover:bg-[#111128] border border-transparent'
              }`}
            >
              전체
            </button>
            {folders.map((folder) => (
              <button
                key={folder.id}
                onClick={() => setActiveFolderId(activeFolderId === folder.id ? null : folder.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1 ${
                  activeFolderId === folder.id
                    ? 'border'
                    : 'text-[#94a3b8] hover:bg-[#111128] border border-transparent'
                }`}
                style={
                  activeFolderId === folder.id
                    ? { borderColor: `${folder.color}50`, color: folder.color, backgroundColor: `${folder.color}15` }
                    : undefined
                }
              >
                <span className="text-xs">{folder.icon}</span>
                {folder.name}
              </button>
            ))}
            <button
              onClick={() => setShowFolderCreator(!showFolderCreator)}
              className="w-6 h-6 rounded-lg text-[#4a4a6a] hover:text-[#94a3b8] hover:bg-[#111128] flex items-center justify-center text-sm transition-all"
              title="새 폴더"
            >
              +
            </button>
          </div>

          {/* New Folder Input */}
          {showFolderCreator && (
            <div className="mt-2 flex gap-1.5">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createFolder()}
                placeholder="폴더 이름..."
                autoFocus
                className="flex-1 px-2.5 py-1.5 bg-[#111128] border border-[#1e1e3a] rounded-lg text-xs text-[#e2e8f0] placeholder-[#64748b] focus:outline-none focus:border-[#e94560]"
              />
              <button
                onClick={createFolder}
                className="px-2.5 py-1.5 bg-[#e94560] text-white rounded-lg text-[10px] font-semibold"
              >
                추가
              </button>
            </div>
          )}
        </div>

        {/* Note List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {pinnedNotes.length > 0 && (
            <div className="mb-2">
              <div className="text-[9px] text-[#64748b] uppercase tracking-widest font-semibold px-2 py-1">
                📌 고정됨
              </div>
              {pinnedNotes.map((note) => (
                <NoteListItem
                  key={note.id}
                  note={note}
                  isActive={note.id === activeNoteId}
                  folder={getFolderInfo(note.folderId)}
                  onClick={() => setActiveNoteId(note.id)}
                  onDelete={() => deleteNote(note.id)}
                  onTogglePin={() => togglePin(note.id)}
                  getRelativeTime={getRelativeTime}
                />
              ))}
            </div>
          )}

          {pinnedNotes.length > 0 && otherNotes.length > 0 && (
            <div className="text-[9px] text-[#64748b] uppercase tracking-widest font-semibold px-2 py-1">
              노트
            </div>
          )}
          {otherNotes.map((note) => (
            <NoteListItem
              key={note.id}
              note={note}
              isActive={note.id === activeNoteId}
              folder={getFolderInfo(note.folderId)}
              onClick={() => setActiveNoteId(note.id)}
              onDelete={() => deleteNote(note.id)}
              onTogglePin={() => togglePin(note.id)}
              getRelativeTime={getRelativeTime}
            />
          ))}

          {filteredNotes.length === 0 && (
            <div className="text-center py-12 text-[#64748b] text-sm">
              {searchQuery ? '검색 결과가 없습니다' : '노트가 없습니다'}
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
          <div className="flex items-center justify-between px-6 py-2.5 border-b border-[#1e1e3a] bg-[#0a0a1a]/50">
            <div className="flex items-center gap-3 text-xs text-[#64748b]">
              <span>수정됨 {getRelativeTime(activeNote.updated_at)}</span>
              <span>·</span>
              <span>{activeNote.blocks.length} 블록</span>
              {activeNote.folderId && (
                <>
                  <span>·</span>
                  <span style={{ color: getFolderInfo(activeNote.folderId)?.color }}>
                    {getFolderInfo(activeNote.folderId)?.icon} {getFolderInfo(activeNote.folderId)?.name}
                  </span>
                </>
              )}
              {activeNote.linkedTaskId && (
                <>
                  <span>·</span>
                  <span className="text-[#22c55e]">🔗 작업 연결됨</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-1">
              {/* AI Button */}
              <button
                onClick={() => setShowAIPanel(!showAIPanel)}
                title="AI 도우미"
                className="h-7 px-2 flex items-center gap-1 text-[#64748b] hover:text-[#8b5cf6] hover:bg-[#8b5cf6]/10 rounded-lg transition-all text-xs"
              >
                <span>🧠</span>
                <span className="text-[10px]">AI</span>
                <span className="px-1 py-0 rounded text-[8px] font-bold bg-gradient-to-r from-amber-500 to-red-500 text-white leading-tight">
                  PRO
                </span>
              </button>

              <div className="w-px h-4 bg-[#1e1e3a] mx-1" />

              {/* Block type buttons */}
              {[
                { type: 'text' as const, label: 'T', title: '텍스트' },
                { type: 'heading2' as const, label: 'H', title: '제목' },
                { type: 'bullet' as const, label: '•', title: '글머리' },
                { type: 'todo' as const, label: '☑', title: '할 일' },
                { type: 'quote' as const, label: '"', title: '인용' },
                { type: 'code' as const, label: '</>', title: '코드' },
                { type: 'divider' as const, label: '—', title: '구분선' },
              ].map((item) => (
                <button
                  key={item.type}
                  onClick={() => {
                    const lastBlock = activeNote.blocks[activeNote.blocks.length - 1];
                    addBlockAfter(lastBlock.id, item.type);
                  }}
                  title={item.title}
                  className="w-7 h-7 flex items-center justify-center text-[#4a4a6a] hover:text-[#e2e8f0] hover:bg-[#1e1e3a] rounded transition-colors text-[11px] font-mono"
                >
                  {item.label}
                </button>
              ))}

              {/* Folder move */}
              <div className="w-px h-4 bg-[#1e1e3a] mx-1" />
              <select
                value={activeNote.folderId || ''}
                onChange={(e) => moveToFolder(activeNote.id, e.target.value || null)}
                className="h-7 px-2 bg-transparent text-[#64748b] text-[10px] border border-[#1e1e3a] rounded-lg focus:outline-none cursor-pointer"
              >
                <option value="" className="bg-[#111128]">폴더 없음</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id} className="bg-[#111128]">
                    {f.icon} {f.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* AI Todo Guide Banner (Premium) */}
          {showAITodoGuide && (
            <div className="px-6 py-3 border-b border-[#1e1e3a] bg-gradient-to-r from-[#8b5cf6]/5 to-[#e94560]/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm">🤖</span>
                  <span className="text-xs text-[#94a3b8]">
                    노트 내용을 분석하여 <strong className="text-[#e2e8f0]">할일 목록에 추가해드릴까요?</strong>
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-gradient-to-r from-amber-500 to-red-500 text-white">PREMIUM</span>
                </div>
                <div className="flex items-center gap-2">
                  <button className="px-3 py-1.5 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white rounded-lg text-[10px] font-semibold transition-colors opacity-50 cursor-not-allowed">
                    업그레이드
                  </button>
                  <button
                    onClick={() => setShowAITodoGuide(false)}
                    className="text-[#4a4a6a] hover:text-[#94a3b8] text-sm"
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* AI Panel */}
          {showAIPanel && (
            <div className="px-6 py-3 border-b border-[#1e1e3a] bg-[#8b5cf6]/5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm">🧠</span>
                <span className="text-xs font-bold text-[#8b5cf6]">AI 도우미</span>
                <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-gradient-to-r from-amber-500 to-red-500 text-white">PREMIUM</span>
              </div>
              {aiGenerating ? (
                <div className="flex items-center gap-2 py-2">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#8b5cf6] animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-[#8b5cf6] animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-[#8b5cf6] animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-xs text-[#8b5cf6]">AI가 분석 중입니다...</span>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={triggerAIGenerate}
                    className="p-2.5 bg-[#111128] border border-[#1e1e3a] rounded-lg text-center hover:border-[#8b5cf6]/30 transition-all group"
                  >
                    <span className="text-lg block mb-1">✨</span>
                    <span className="text-[10px] text-[#94a3b8] group-hover:text-[#e2e8f0]">자동 작성</span>
                  </button>
                  <button
                    onClick={triggerAISummarize}
                    className="p-2.5 bg-[#111128] border border-[#1e1e3a] rounded-lg text-center hover:border-[#8b5cf6]/30 transition-all group"
                  >
                    <span className="text-lg block mb-1">📊</span>
                    <span className="text-[10px] text-[#94a3b8] group-hover:text-[#e2e8f0]">요약하기</span>
                  </button>
                  <button
                    onClick={() => {
                      setAiGenerating(true);
                      setTimeout(() => {
                        const actionBlocks: NoteBlock[] = [
                          { id: `ai-${Date.now()}-1`, type: 'divider', content: '' },
                          { id: `ai-${Date.now()}-2`, type: 'heading3', content: '⚡ AI 액션 아이템' },
                          { id: `ai-${Date.now()}-3`, type: 'todo', content: '노트 내용 기반 후속 조치 검토', checked: false },
                          { id: `ai-${Date.now()}-4`, type: 'todo', content: '관련 팀원에게 공유', checked: false },
                          { id: `ai-${Date.now()}-5`, type: 'todo', content: '다음 회의 안건에 추가', checked: false },
                        ];
                        setNotes((prev) => {
                          const updated = prev.map((n) =>
                            n.id === activeNoteId
                              ? { ...n, blocks: [...n.blocks, ...actionBlocks], updated_at: new Date().toISOString() }
                              : n
                          );
                          const note = updated.find((n) => n.id === activeNoteId);
                          if (note) saveNoteToFirestore(note);
                          return updated;
                        });
                        setAiGenerating(false);
                        setShowAIPanel(false);
                      }, 1800);
                    }}
                    className="p-2.5 bg-[#111128] border border-[#1e1e3a] rounded-lg text-center hover:border-[#8b5cf6]/30 transition-all group"
                  >
                    <span className="text-lg block mb-1">⚡</span>
                    <span className="text-[10px] text-[#94a3b8] group-hover:text-[#e2e8f0]">액션 추출</span>
                  </button>
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
                  <button
                    onClick={() => setShowIconPicker(!showIconPicker)}
                    className="text-4xl hover:scale-110 transition-transform"
                  >
                    {activeNote.icon}
                  </button>
                  {showIconPicker && (
                    <div className="absolute top-12 left-0 bg-[#111128] border border-[#1e1e3a] rounded-xl p-3 shadow-xl z-10 min-w-[240px]">
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 36px)', gap: '4px' }}>
                        {NOTE_ICONS.map((icon) => (
                          <button
                            key={icon}
                            onClick={() => updateNoteIcon(icon)}
                            style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', borderRadius: '8px' }}
                            className="hover:bg-[#1e1e3a] transition-colors"
                          >
                            {icon}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <input
                  value={activeNote.title}
                  onChange={(e) => updateNoteTitle(e.target.value)}
                  placeholder="제목 없음"
                  className="w-full bg-transparent text-3xl font-extrabold text-[#e2e8f0] placeholder-[#4a4a6a] outline-none"
                />

                {/* Tags + Linked Task */}
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  {activeNote.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2.5 py-0.5 bg-[#e94560]/10 text-[#e94560] text-[10px] font-semibold rounded-full border border-[#e94560]/20"
                    >
                      {tag}
                    </span>
                  ))}
                  {activeNote.linkedTaskId && (
                    <span className="px-2.5 py-0.5 bg-[#22c55e]/10 text-[#22c55e] text-[10px] font-semibold rounded-full border border-[#22c55e]/20 flex items-center gap-1">
                      🔗 연결된 작업
                    </span>
                  )}
                </div>
              </div>

              {/* Blocks */}
              <div className="space-y-0.5">
                {activeNote.blocks.map((block) => (
                  <div
                    key={block.id}
                    className="group relative py-1.5 px-1 -mx-1 rounded hover:bg-[#ffffff04] transition-colors"
                  >
                    <div className="absolute -left-7 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-[#3a3a5a] cursor-grab text-[10px]">⋮⋮</span>
                    </div>
                    {renderBlock(block)}
                  </div>
                ))}
              </div>

              {/* Add block button */}
              <button
                onClick={() => {
                  const lastBlock = activeNote.blocks[activeNote.blocks.length - 1];
                  addBlockAfter(lastBlock.id);
                }}
                className="mt-4 w-full py-2 text-[#3a3a5a] hover:text-[#94a3b8] text-sm text-left transition-colors"
              >
                + 새 블록 &nbsp; <span className="text-[10px] opacity-50">Enter로도 추가 가능</span>
              </button>

              {/* Shortcuts hint */}
              <div className="mt-12 p-4 bg-[#0d0d20] border border-[#1e1e3a]/50 rounded-xl">
                <div className="text-[10px] text-[#4a4a6a] uppercase tracking-wider font-semibold mb-3">
                  단축키
                </div>
                <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 text-[11px] text-[#64748b]">
                  {[
                    { key: '#', desc: '제목 1' }, { key: '##', desc: '제목 2' }, { key: '###', desc: '제목 3' },
                    { key: '-', desc: '글머리' }, { key: '1.', desc: '번호' }, { key: '[]', desc: '체크리스트' },
                    { key: '>', desc: '인용문' }, { key: '---', desc: '구분선' }, { key: '```', desc: '코드' },
                  ].map((s) => (
                    <div key={s.key} className="flex items-center gap-1.5">
                      <code className="px-1 py-0.5 bg-[#1e1e3a]/50 rounded text-[9px] text-[#e94560]/70 font-mono min-w-[2em] text-center">
                        {s.key}
                      </code>
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
            <p className="text-[#94a3b8] font-semibold text-lg">노트를 선택하세요</p>
            <p className="text-[#64748b] text-sm mt-1">또는 새 노트를 만들어보세요</p>
            <button
              onClick={createNote}
              className="mt-4 px-5 py-2.5 bg-[#e94560] hover:bg-[#ff5a7a] text-white font-semibold rounded-xl text-sm transition-colors"
            >
              + 새 노트 만들기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Note List Item Component
// ============================================================================

function NoteListItem({
  note,
  isActive,
  folder,
  onClick,
  onDelete,
  onTogglePin,
  getRelativeTime,
}: {
  note: Note;
  isActive: boolean;
  folder?: Folder;
  onClick: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  getRelativeTime: (date: string) => string;
}) {
  const preview = note.blocks
    .filter((b) => b.type !== 'divider' && b.content)
    .slice(0, 2)
    .map((b) => b.content)
    .join(' · ');

  const todoBlocks = note.blocks.filter((b) => b.type === 'todo');
  const checkedTodos = todoBlocks.filter((b) => b.checked);

  return (
    <div
      onClick={onClick}
      className={`group relative p-3 rounded-xl cursor-pointer transition-all ${
        isActive
          ? 'bg-[#111128] border border-[#e94560]/30 shadow-[0_0_12px_rgba(233,69,96,0.05)]'
          : 'hover:bg-[#111128]/60 border border-transparent'
      }`}
    >
      {/* Actions */}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
        <button
          onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
          className={`w-6 h-6 flex items-center justify-center rounded text-xs transition-colors ${
            note.pinned ? 'text-[#e94560]' : 'text-[#64748b] hover:text-[#e94560]'
          }`}
        >
          📌
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="w-6 h-6 flex items-center justify-center rounded text-[#64748b] hover:text-[#e94560] text-xs"
        >
          ×
        </button>
      </div>

      <div className="flex items-start gap-2.5">
        <span className="text-lg flex-shrink-0 mt-0.5">{note.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{note.title}</p>
          <p className="text-[11px] text-[#4a4a6a] truncate mt-0.5">{preview || '내용 없음'}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[10px] text-[#3a3a5a]">
              {getRelativeTime(note.updated_at)}
            </span>
            {folder && (
              <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ color: folder.color, backgroundColor: `${folder.color}15` }}>
                {folder.icon} {folder.name}
              </span>
            )}
            {todoBlocks.length > 0 && (
              <span className="text-[9px] text-[#64748b]">
                ☑ {checkedTodos.length}/{todoBlocks.length}
              </span>
            )}
            {note.linkedTaskId && (
              <span className="text-[9px] text-[#22c55e]">🔗</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
