'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { TaskData, SubTask, TaskAttachment, NoteData, RecurrenceRule } from '@/lib/firestore';
import { useDataStore } from '@/lib/data-store';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n-context';
import { requestNotificationPermission } from '@/lib/use-reminders';
import {
  uploadAttachment, openAttachmentByURL, deleteAttachmentFromStorage,
  openAttachment, deleteAttachments,
  MAX_ATTACHMENT_SIZE,
} from '@/lib/attachment-store';

interface TaskDetailPanelProps {
  task: TaskData;
  onClose: () => void;
  onUpdate: (updates: Partial<TaskData>) => void;
  onDelete: () => void;
}

const PRIORITY_VALUES = [
  { value: 'urgent', color: '#ef4444' },
  { value: 'high', color: '#f97316' },
  { value: 'medium', color: '#eab308' },
  { value: 'low', color: '#22c55e' },
] as const;

const MAX_FILE_SIZE = MAX_ATTACHMENT_SIZE; // 10 MB

export default function TaskDetailPanel({ task, onClose, onUpdate, onDelete }: TaskDetailPanelProps) {
  const { user } = useAuth();
  const router = useRouter();
  const { t, language } = useI18n();
  const dateLocale = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', es: 'es-ES', pt: 'pt-BR', fr: 'fr-FR' }[language] ?? 'en-US';

  // ── Title ──────────────────────────────────────────────────────────────────
  const [titleValue, setTitleValue] = useState(task.title);
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Sub-tasks ──────────────────────────────────────────────────────────────
  const [subTaskInput, setSubTaskInput] = useState('');
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editingSubTitle, setEditingSubTitle] = useState('');
  const editingSubRef = useRef<HTMLInputElement>(null);
  const [subDragSrcIdx, setSubDragSrcIdx] = useState<number | null>(null);
  const [subDragOverIdx, setSubDragOverIdx] = useState<number | null>(null);

  // ── Memo ───────────────────────────────────────────────────────────────────
  const [memoValue, setMemoValue] = useState(task.memo ?? '');
  const memoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const memoRef = useRef<HTMLTextAreaElement>(null);
  const [memoFocused, setMemoFocused] = useState(false);

  // ── Linked Notes ───────────────────────────────────────────────────────────
  const { notes: allNotes, lists: allLists } = useDataStore();
  const [showNoteSelector, setShowNoteSelector] = useState(false);

  const subTaskInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Recurrence ─────────────────────────────────────────────────────────────
  type RecurrencePreset = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
  const [recurrencePreset, setRecurrencePreset] = useState<RecurrencePreset>('none');
  const [customInterval, setCustomInterval] = useState(1);
  const [customFreq, setCustomFreq] = useState<RecurrenceRule['freq']>('daily');

  // Sync when a different task is selected
  useEffect(() => {
    setTitleValue(task.title);
    setMemoValue(task.memo ?? '');
    setEditingSubId(null);
    // Sync recurrence state
    const rule = task.recurrence_rule;
    if (!rule) {
      setRecurrencePreset('none');
    } else if ((rule.interval ?? 1) === 1) {
      setRecurrencePreset(rule.freq as RecurrencePreset);
    } else {
      setRecurrencePreset('custom');
      setCustomInterval(rule.interval ?? 1);
      setCustomFreq(rule.freq);
    }
  }, [task.id, task.recurrence_rule]);

  useEffect(() => {
    if (editingSubId && editingSubRef.current) {
      editingSubRef.current.focus();
      editingSubRef.current.select();
    }
  }, [editingSubId]);

  // ── Recurrence handlers ────────────────────────────────────────────────────

  const handleRecurrenceChange = (preset: RecurrencePreset) => {
    setRecurrencePreset(preset);
    if (preset === 'none') {
      onUpdate({ recurrence_rule: null });
    } else if (preset !== 'custom') {
      onUpdate({ recurrence_rule: { freq: preset as RecurrenceRule['freq'], interval: 1 } });
    }
  };

  const applyCustomRecurrence = () => {
    onUpdate({ recurrence_rule: { freq: customFreq, interval: customInterval } });
  };

  // ── Title editing ──────────────────────────────────────────────────────────

  const handleTitleChange = (value: string) => {
    setTitleValue(value);
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => {
      onUpdate({ title: value.trim() || t('notes.untitled') });
    }, 400);
  };

  // ── Sub-tasks ──────────────────────────────────────────────────────────────

  const subTasks: SubTask[] = task.subTasks ?? [];

  const addSubTask = () => {
    const title = subTaskInput.trim();
    if (!title) return;
    const newSub: SubTask = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title,
      completed: false,
    };
    onUpdate({ subTasks: [...subTasks, newSub] });
    setSubTaskInput('');
    subTaskInputRef.current?.focus();
  };

  const toggleSubTask = (id: string) => {
    onUpdate({ subTasks: subTasks.map((s) => s.id === id ? { ...s, completed: !s.completed } : s) });
  };

  const deleteSubTask = (id: string) => {
    onUpdate({ subTasks: subTasks.filter((s) => s.id !== id) });
  };

  const startEditSubTask = (sub: SubTask) => {
    setEditingSubId(sub.id);
    setEditingSubTitle(sub.title);
  };

  const saveSubTaskEdit = (id: string) => {
    const trimmed = editingSubTitle.trim();
    if (trimmed) {
      onUpdate({ subTasks: subTasks.map((s) => s.id === id ? { ...s, title: trimmed } : s) });
    }
    setEditingSubId(null);
  };

  // ── Memo ───────────────────────────────────────────────────────────────────

  const handleMemoChange = (value: string) => {
    setMemoValue(value);
    if (memoTimer.current) clearTimeout(memoTimer.current);
    memoTimer.current = setTimeout(() => onUpdate({ memo: value }), 500);
  };

  const autoResizeMemo = useCallback(() => {
    const el = memoRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 80)}px`;
  }, []);

  useEffect(() => {
    autoResizeMemo();
  }, [memoValue, autoResizeMemo]);

  const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/g;

  const handleLinkClick = (url: string) => {
    if (confirm(`Open link in browser?\n\n${url}`)) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const renderMemoWithLinks = (text: string) => {
    if (!text) return null;
    const parts: (string | { url: string; key: number })[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let keyCounter = 0;
    const regex = new RegExp(URL_REGEX.source, 'g');
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      parts.push({ url: match[0], key: keyCounter++ });
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }
    if (parts.length === 1 && typeof parts[0] === 'string') return null;
    return (
      <div className="mt-2 text-xs text-text-primary leading-relaxed whitespace-pre-wrap break-words">
        {parts.map((part) =>
          typeof part === 'string' ? (
            part
          ) : (
            <a
              key={part.key}
              onClick={(e) => { e.preventDefault(); handleLinkClick(part.url); }}
              href={part.url}
              className="text-[#60a5fa] hover:text-[#93bbfc] underline cursor-pointer break-all"
            >
              {part.url}
            </a>
          )
        )}
      </div>
    );
  };

  // ── Attachments ────────────────────────────────────────────────────────────

  const attachments: TaskAttachment[] = task.attachments ?? [];
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ name: string; percent: number }[]>([]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const allFiles = Array.from(e.target.files ?? []);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!allFiles.length || !user || !task.id) return;

    const files = allFiles.filter((f) => {
      if (f.size > MAX_FILE_SIZE) {
        alert(`"${f.name}" exceeds 10 MB and cannot be attached.`);
        return false;
      }
      return true;
    });
    if (!files.length) return;

    setUploading(true);
    setUploadProgress(files.map((f) => ({ name: f.name, percent: 0 })));

    const newAtts: TaskAttachment[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const { downloadURL, storagePath } = await uploadAttachment(
        user.uid, task.id, file, id,
        (percent) => {
          setUploadProgress((prev) => prev.map((p, j) => j === i ? { ...p, percent } : p));
        },
      );
      newAtts.push({
        id,
        name: file.name,
        size: file.size,
        type: file.type,
        addedAt: new Date().toISOString(),
        downloadURL,
        storagePath,
      });
      setUploadProgress((prev) => prev.map((p, j) => j === i ? { ...p, percent: 100 } : p));
    }
    onUpdate({ attachments: [...attachments, ...newAtts] });
    setUploading(false);
    setUploadProgress([]);
  };

  const deleteAttachment = async (att: TaskAttachment) => {
    if (att.storagePath) {
      await deleteAttachmentFromStorage(att.storagePath);
    } else {
      await deleteAttachments([att.id]); // 구형 IndexedDB
    }
    onUpdate({ attachments: attachments.filter((a) => a.id !== att.id) });
  };

  const handleOpenAttachment = (att: TaskAttachment) => {
    if (att.downloadURL) {
      openAttachmentByURL(att.downloadURL, att.name, att.type);
    } else {
      openAttachment(att.id, att.name, att.type); // 구형 IndexedDB
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const completedSubCount = subTasks.filter((s) => s.completed).length;

  const fileIcon = (type: string) => {
    if (type.startsWith('image/')) return '🖼️';
    if (type.includes('pdf')) return '📄';
    if (type.includes('word') || type.includes('document')) return '📝';
    if (type.includes('sheet') || type.includes('excel')) return '📊';
    if (type.startsWith('video/')) return '🎬';
    if (type.startsWith('audio/')) return '🎵';
    return '📎';
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed top-14 md:top-0 right-0 bottom-0 w-full md:w-[380px] z-50 flex flex-col bg-background-card border-l border-border shadow-2xl animate-slide-in-right overflow-hidden">

        {/* Header — editable title */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-border flex-shrink-0">
          <div className="flex-1 pr-3">
            <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-1">{t('detail.title')}</p>
            <textarea
              value={titleValue}
              onChange={(e) => handleTitleChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); } }}
              rows={2}
              placeholder={t('detail.titlePlaceholder')}
              className="w-full bg-transparent text-base font-bold text-text-primary leading-snug resize-none focus:outline-none border-b border-transparent hover:border-border focus:border-[#e94560]/50 transition-colors placeholder-text-muted"
            />
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-border transition-colors flex-shrink-0 mt-5"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Priority & Due Date & Reminder ─────────────────────────────── */}
          <div className="px-5 py-4 border-b border-border space-y-3">
            {/* List */}
            {allLists.length > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-text-muted text-xs w-16 flex-shrink-0">{t('detail.list')}</span>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: allLists.find((l) => l.id === task.listId)?.color ?? '#e94560' }}
                  />
                  <select
                    value={task.listId ?? ''}
                    onChange={(e) => onUpdate({ listId: e.target.value })}
                    className="flex-1 min-w-0 px-2 py-1.5 bg-background border border-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-[#e94560] transition-colors"
                  >
                    {allLists.map((l) => (
                      <option key={l.id} value={l.id!} className="bg-background-card">{l.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Priority */}
            <div className="flex items-center gap-3">
              <span className="text-text-muted text-xs w-16 flex-shrink-0">{t('detail.priority')}</span>
              <div className="flex gap-1.5">
                {PRIORITY_VALUES.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => onUpdate({ priority: p.value })}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all border"
                    style={
                      task.priority === p.value
                        ? { borderColor: p.color, color: p.color, backgroundColor: `${p.color}20` }
                        : { borderColor: 'transparent', color: 'var(--color-text-inactive)' }
                    }
                  >
                    {t(`priority.${p.value}`)}
                  </button>
                ))}
              </div>
            </div>

            {/* Due Date */}
            <div className="flex items-center gap-3">
              <span className="text-text-muted text-xs w-16 flex-shrink-0">{t('detail.dueDate')}</span>
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="date"
                  value={task.dueDate ?? ''}
                  onChange={(e) => onUpdate({ dueDate: e.target.value || null })}
                  className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-[#e94560] transition-colors"
                />
                {task.dueDate && (
                  <button onClick={() => onUpdate({ dueDate: null })} className="text-text-muted hover:text-[#e94560] text-sm transition-colors">×</button>
                )}
              </div>
            </div>

            {/* Created Date (등록일) */}
            <div className="flex items-center gap-3">
              <span className="text-text-muted text-xs w-16 flex-shrink-0">{t('detail.createdDate')}</span>
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="date"
                  value={task.createdDate ?? (task.createdAt && typeof task.createdAt.toDate === 'function' ? (() => { const d = task.createdAt.toDate(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })() : '')}
                  onChange={(e) => onUpdate({ createdDate: e.target.value || null })}
                  className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-[#e94560] transition-colors"
                />
              </div>
            </div>

            {/* Recurrence (반복) */}
            <div className="flex items-center gap-3">
              <span className="text-text-muted text-xs w-16 flex-shrink-0">{t('recurrence.label')}</span>
              <div className="flex items-center gap-2 flex-1">
                <select
                  value={recurrencePreset}
                  onChange={(e) => handleRecurrenceChange(e.target.value as RecurrencePreset)}
                  className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-[#e94560] transition-colors"
                >
                  <option value="none">{t('recurrence.none')}</option>
                  <option value="daily">{t('recurrence.daily')}</option>
                  <option value="weekly">{t('recurrence.weekly')}</option>
                  <option value="monthly">{t('recurrence.monthly')}</option>
                  <option value="yearly">{t('recurrence.yearly')}</option>
                  <option value="custom">{t('recurrence.custom')}</option>
                </select>
                {task.recurrence_rule && (
                  <button onClick={() => handleRecurrenceChange('none')} className="text-text-muted hover:text-[#e94560] text-sm transition-colors flex-shrink-0">×</button>
                )}
              </div>
            </div>
            {recurrencePreset === 'custom' && (
              <div className="flex items-center gap-3">
                <span className="text-text-muted text-xs w-16 flex-shrink-0">{t('detail.interval')}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    value={customInterval}
                    onChange={(e) => setCustomInterval(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-14 px-2 py-1.5 bg-background border border-border rounded-lg text-xs text-center text-text-primary focus:outline-none focus:border-[#e94560]"
                  />
                  <select
                    value={customFreq}
                    onChange={(e) => setCustomFreq(e.target.value as RecurrenceRule['freq'])}
                    className="px-2 py-1.5 bg-background border border-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-[#e94560]"
                  >
                    <option value="daily">{t('recurrence.unit.days')}</option>
                    <option value="weekly">{t('recurrence.unit.weeks')}</option>
                    <option value="monthly">{t('recurrence.unit.months')}</option>
                    <option value="yearly">{t('recurrence.unit.years')}</option>
                  </select>
                  <button onClick={applyCustomRecurrence} className="px-2.5 py-1.5 bg-[#e94560] text-white text-xs rounded-lg hover:bg-[#ff5a7a] transition-colors">{t('recurrence.apply')}</button>
                </div>
              </div>
            )}
            {task.recurrence_rule && (
              <p className="text-[10px] text-[#8b5cf6] flex items-center gap-1 pl-20">
                <span>🔁</span>
                <span>{t('detail.recurrenceAuto')}</span>
              </p>
            )}

            {/* Reminder */}
            <div className="flex items-center gap-3">
              <span className="text-text-muted text-xs w-16 flex-shrink-0">{t('detail.reminder')}</span>
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="datetime-local"
                  value={task.reminder ?? ''}
                  onChange={async (e) => {
                    const val = e.target.value;
                    if (val) await requestNotificationPermission();
                    onUpdate({ reminder: val || null });
                  }}
                  className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-[#e94560] transition-colors"
                />
                {task.reminder && (
                  <button onClick={() => onUpdate({ reminder: null })} className="text-text-muted hover:text-[#e94560] text-sm transition-colors">×</button>
                )}
              </div>
            </div>

            {task.reminder && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'denied' && (
              <p className="text-[10px] text-amber-400 flex items-center gap-1">
                <span>⚠️</span>
                <span>{t('detail.notifBlocked')}</span>
              </p>
            )}
          </div>

          {/* ── Sub-tasks ───────────────────────────────────────────────────── */}
          <div className="px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm">📋</span>
              <span className="text-xs font-bold text-text-primary">{t('detail.subTasks')}</span>
              {subTasks.length > 0 && (
                <span className="text-[10px] text-text-muted">{completedSubCount}/{subTasks.length}</span>
              )}
            </div>

            {subTasks.length > 0 && (
              <div className="h-1 bg-border rounded-full overflow-hidden mb-3">
                <div
                  className="h-full bg-gradient-to-r from-[#e94560] to-[#8b5cf6] rounded-full transition-all duration-300"
                  style={{ width: `${(completedSubCount / subTasks.length) * 100}%` }}
                />
              </div>
            )}

            <div className="space-y-1 mb-3">
              {subTasks.map((sub, idx) => {
                const isDragging = subDragSrcIdx === idx;
                const isDragOver = subDragOverIdx === idx;
                return (
                  <div
                    key={sub.id}
                    draggable
                    onDragStart={() => { setSubDragSrcIdx(idx); setSubDragOverIdx(null); }}
                    onDragOver={(e) => { e.preventDefault(); if (idx !== subDragSrcIdx) setSubDragOverIdx(idx); }}
                    onDragLeave={() => setSubDragOverIdx(null)}
                    onDrop={() => {
                      if (subDragSrcIdx === null || subDragSrcIdx === idx) { setSubDragSrcIdx(null); setSubDragOverIdx(null); return; }
                      const reordered = [...subTasks];
                      const [moved] = reordered.splice(subDragSrcIdx, 1);
                      reordered.splice(idx, 0, moved);
                      onUpdate({ subTasks: reordered });
                      setSubDragSrcIdx(null); setSubDragOverIdx(null);
                    }}
                    onDragEnd={() => { setSubDragSrcIdx(null); setSubDragOverIdx(null); }}
                    className={`flex items-center gap-2.5 group py-1 px-2 -mx-2 rounded-lg transition-colors cursor-grab active:cursor-grabbing
                      ${isDragging ? 'opacity-40' : ''}
                      ${isDragOver ? 'border-t-2 border-[#e94560]' : 'hover:bg-border/30'}
                    `}
                  >
                    {/* 드래그 핸들 */}
                    <span className="opacity-0 group-hover:opacity-40 text-text-muted flex-shrink-0 cursor-grab" style={{ fontSize: 10 }}>⠿</span>

                    {/* 체크박스 */}
                    <button
                      onClick={() => toggleSubTask(sub.id)}
                      className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                        sub.completed
                          ? 'bg-gradient-to-br from-[#e94560] to-[#8b5cf6] border-transparent'
                          : 'hover:border-[#e94560]'
                      }`}
                      style={sub.completed ? undefined : { borderColor: 'var(--color-checkbox-border)' }}
                    >
                      {sub.completed && (
                        <svg width="8" height="8" viewBox="0 0 14 14" fill="none">
                          <path d="M3 7L6 10L11 4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>

                    {/* 제목 — 클릭 시 인라인 편집 */}
                    {editingSubId === sub.id ? (
                      <input
                        ref={editingSubRef}
                        value={editingSubTitle}
                        onChange={(e) => setEditingSubTitle(e.target.value)}
                        onBlur={() => saveSubTaskEdit(sub.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveSubTaskEdit(sub.id);
                          if (e.key === 'Escape') setEditingSubId(null);
                        }}
                        className="flex-1 text-xs text-text-primary bg-background border border-[#e94560]/50 rounded px-1.5 py-0.5 focus:outline-none"
                      />
                    ) : (
                      <span
                        onClick={() => startEditSubTask(sub)}
                        className={`flex-1 text-xs cursor-text ${
                          sub.completed ? 'line-through text-text-inactive' : 'text-text-primary hover:text-[#e94560]'
                        }`}
                        title="클릭하여 수정"
                      >
                        {sub.title}
                      </span>
                    )}

                    <button
                      onClick={() => deleteSubTask(sub.id)}
                      className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center text-text-muted hover:text-[#e94560] transition-all text-sm"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Add sub-task input */}
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded border-2 border-dashed border-border flex-shrink-0" />
              <input
                ref={subTaskInputRef}
                type="text"
                value={subTaskInput}
                onChange={(e) => setSubTaskInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addSubTask(); if (e.key === 'Escape') setSubTaskInput(''); }}
                placeholder={t('detail.addSubTask')}
                className="flex-1 bg-transparent text-xs text-text-primary placeholder-text-inactive outline-none"
              />
              {subTaskInput.trim() && (
                <button onClick={addSubTask} className="text-[10px] px-2 py-0.5 bg-[#e94560] text-white rounded font-semibold">{t('common.add')}</button>
              )}
            </div>
          </div>

          {/* ── Memo ────────────────────────────────────────────────────────── */}
          <div className="px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm">📝</span>
              <span className="text-xs font-bold text-text-primary">{t('detail.memo')}</span>
            </div>
            <textarea
              ref={memoRef}
              value={memoValue}
              onChange={(e) => handleMemoChange(e.target.value)}
              onFocus={() => setMemoFocused(true)}
              onBlur={() => setMemoFocused(false)}
              placeholder={t('detail.memoPlaceholder')}
              rows={1}
              style={{ minHeight: '80px', overflow: 'hidden' }}
              className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-xs text-text-primary placeholder-text-inactive resize-none focus:outline-none focus:border-[#e94560] transition-colors leading-relaxed"
            />
            {!memoFocused && memoValue && renderMemoWithLinks(memoValue)}
          </div>

          {/* ── Attachments (IndexedDB) ──────────────────────────────────────── */}
          <div className="px-5 py-4 border-b border-border">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-sm">📎</span>
                <span className="text-xs font-bold text-text-primary">{t('detail.attachments')}</span>
                {attachments.length > 0 && <span className="text-[10px] text-text-muted">{attachments.length}</span>}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-[10px] px-2.5 py-1 border border-border rounded-lg text-text-secondary hover:border-[#e94560] hover:text-[#e94560] transition-colors font-semibold"
              >
                {t('detail.addFile')}
              </button>
              <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} className="hidden" />
            </div>
            <p className="text-[10px] text-text-muted mb-3">{t('detail.fileLimit')}</p>

            {/* 업로드 진행률 */}
            {uploading && uploadProgress.length > 0 && (
              <div className="mb-3 space-y-2">
                {uploadProgress.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-text-secondary truncate mb-1">{p.name}</p>
                      <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[#e94560] to-[#533483] rounded-full transition-all duration-300"
                          style={{ width: `${p.percent}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-[10px] text-text-muted flex-shrink-0 w-8 text-right">{p.percent}%</span>
                  </div>
                ))}
              </div>
            )}

            {attachments.length === 0 && !uploading ? (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-4 border-2 border-dashed border-border rounded-lg text-center text-text-inactive text-xs hover:border-[#e94560]/40 hover:text-text-muted transition-colors"
              >
                {t('detail.dropFile')}
              </button>
            ) : (
              <div className="space-y-1.5">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    onClick={() => handleOpenAttachment(att)}
                    className="flex items-center gap-2.5 p-2 bg-background rounded-lg border border-border group transition-colors cursor-pointer hover:border-[#e94560]/40"
                  >
                    <span className="text-lg flex-shrink-0">{fileIcon(att.type)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-text-primary truncate font-medium">{att.name}</p>
                      <p className="text-[10px] text-text-muted">
                        {formatFileSize(att.size)} · {formatDate(att.addedAt)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteAttachment(att); }}
                      className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center text-text-muted hover:text-[#e94560] transition-all flex-shrink-0"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Status ──────────────────────────────────────────────────────── */}
          <div className="px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm">⚙️</span>
              <span className="text-xs font-bold text-text-primary">{t('detail.status')}</span>
            </div>
            <div className="flex gap-2">
              {(['todo', 'in_progress', 'completed'] as const).map((s) => {
                const labels = { todo: t('status.todo'), in_progress: t('status.inProgress'), completed: t('status.completed') };
                const colors = { todo: '#64748b', in_progress: '#f59e0b', completed: '#22c55e' };
                const isActive = task.status === s;
                return (
                  <button
                    key={s}
                    onClick={() => onUpdate({ status: s })}
                    className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold border transition-all"
                    style={
                      isActive
                        ? { borderColor: colors[s], color: colors[s], backgroundColor: `${colors[s]}20` }
                        : { borderColor: 'transparent', color: 'var(--color-text-inactive)' }
                    }
                  >
                    {labels[s]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Linked Notes ─────────────────────────────────────────────────── */}
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm">📝</span>
                <span className="text-xs font-bold text-text-primary">{t('detail.linkedNotes')}</span>
                {(task.linkedNoteIds?.length ?? 0) > 0 && (
                  <span className="text-[10px] text-text-muted">{task.linkedNoteIds!.length}개</span>
                )}
              </div>
              <button
                onClick={() => setShowNoteSelector(!showNoteSelector)}
                className="text-[10px] px-2.5 py-1 border border-border rounded-lg text-text-secondary hover:border-[#e94560] hover:text-[#e94560] transition-colors font-semibold"
              >
                {t('detail.linkNote')}
              </button>
            </div>

            {/* Linked notes list */}
            {(task.linkedNoteIds ?? []).length > 0 && (
              <div className="space-y-1.5 mb-3">
                {(task.linkedNoteIds ?? []).map((noteId) => {
                  const note = allNotes.find((n) => n.id === noteId);
                  if (!note) return null;
                  return (
                    <div key={noteId} className="flex items-center gap-2 p-2 bg-background rounded-lg border border-border group hover:border-[#8b5cf6]/40 transition-colors">
                      <button
                        onClick={() => { onClose(); router.push(`/notes?note=${noteId}`); }}
                        className="flex items-center gap-2 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
                        title="노트로 이동"
                      >
                        <span className="text-base flex-shrink-0">{note.icon || '📝'}</span>
                        <span className="text-xs text-text-primary truncate">{note.title}</span>
                        <span className="text-[9px] text-[#8b5cf6] flex-shrink-0 opacity-0 group-hover:opacity-100">↗</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const updated = (task.linkedNoteIds ?? []).filter((id) => id !== noteId);
                          onUpdate({ linkedNoteIds: updated });
                        }}
                        className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center text-text-muted hover:text-[#e94560] transition-all text-sm flex-shrink-0"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Note selector dropdown */}
            {showNoteSelector && (
              <div className="border border-border rounded-lg bg-background overflow-hidden max-h-40 overflow-y-auto">
                {allNotes
                  .filter((n) => !(task.linkedNoteIds ?? []).includes(n.id!))
                  .map((note) => (
                    <button
                      key={note.id}
                      onClick={() => {
                        const updated = [...(task.linkedNoteIds ?? []), note.id!];
                        onUpdate({ linkedNoteIds: updated });
                        setShowNoteSelector(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-background-hover transition-colors"
                    >
                      <span className="text-sm">{note.icon || '📝'}</span>
                      <span className="text-xs text-text-primary truncate">{note.title}</span>
                    </button>
                  ))}
                {allNotes.filter((n) => !(task.linkedNoteIds ?? []).includes(n.id!)).length === 0 && (
                  <p className="text-xs text-text-muted text-center py-3">{t('detail.noNotesAvail')}</p>
                )}
              </div>
            )}

            {task.status === 'completed' && (task.linkedNoteIds?.length ?? 0) > 0 && (
              <p className="text-[10px] text-amber-400 mt-2 flex items-center gap-1">
                <span>⚠️</span>
                <span>{t('detail.completedNoteWarning')}</span>
              </p>
            )}
          </div>
        </div>

        {/* Footer – Delete */}
        <div className="px-5 py-4 border-t border-border flex-shrink-0">
          <button
            onClick={() => {
              if (confirm(t('detail.delete') + '?')) {
                onDelete();
                onClose();
              }
            }}
            className="w-full py-2.5 rounded-xl border border-[#e94560]/30 text-[#e94560] text-sm font-semibold hover:bg-[#e94560]/10 transition-colors"
          >
            {t('detail.delete')}
          </button>
        </div>
      </div>
    </>
  );
}
