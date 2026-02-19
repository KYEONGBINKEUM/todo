'use client';

import { useState, useRef, useEffect } from 'react';
import { TaskData, SubTask, TaskAttachment } from '@/lib/firestore';

interface TaskDetailPanelProps {
  task: TaskData;
  onClose: () => void;
  onUpdate: (updates: Partial<TaskData>) => void;
  onDelete: () => void;
}

const PRIORITY_OPTIONS = [
  { value: 'urgent', label: '긴급', color: '#ef4444' },
  { value: 'high', label: '높음', color: '#f97316' },
  { value: 'medium', label: '보통', color: '#eab308' },
  { value: 'low', label: '낮음', color: '#22c55e' },
] as const;

export default function TaskDetailPanel({ task, onClose, onUpdate, onDelete }: TaskDetailPanelProps) {
  const [subTaskInput, setSubTaskInput] = useState('');
  const [memoValue, setMemoValue] = useState(task.memo ?? '');
  const [memoTimer, setMemoTimer] = useState<NodeJS.Timeout | null>(null);
  const subTaskInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync memo when task changes
  useEffect(() => {
    setMemoValue(task.memo ?? '');
  }, [task.id]);

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
    onUpdate({
      subTasks: subTasks.map((s) =>
        s.id === id ? { ...s, completed: !s.completed } : s
      ),
    });
  };

  const deleteSubTask = (id: string) => {
    onUpdate({ subTasks: subTasks.filter((s) => s.id !== id) });
  };

  // ── Memo ───────────────────────────────────────────────────────────────────

  const handleMemoChange = (value: string) => {
    setMemoValue(value);
    if (memoTimer) clearTimeout(memoTimer);
    setMemoTimer(
      setTimeout(() => {
        onUpdate({ memo: value });
      }, 500)
    );
  };

  // ── Attachments (metadata only) ────────────────────────────────────────────

  const attachments: TaskAttachment[] = task.attachments ?? [];

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const newAttachments: TaskAttachment[] = files.map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: f.name,
      size: f.size,
      type: f.type,
      addedAt: new Date().toISOString(),
    }));
    onUpdate({ attachments: [...attachments, ...newAttachments] });
    // Reset input so same file can be re-added
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const deleteAttachment = (id: string) => {
    onUpdate({ attachments: attachments.filter((a) => a.id !== id) });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const completedSubCount = subTasks.filter((s) => s.completed).length;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-[380px] z-50 flex flex-col bg-background-card border-l border-border shadow-2xl animate-slide-in-right overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-border flex-shrink-0">
          <div className="flex-1 pr-3">
            <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-1">할일 상세</p>
            <h3 className="text-base font-bold text-text-primary leading-snug">{task.title}</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-border transition-colors flex-shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Priority & Due Date ─────────────────────────────────────────── */}
          <div className="px-5 py-4 border-b border-border space-y-3">
            {/* Priority */}
            <div className="flex items-center gap-3">
              <span className="text-text-muted text-xs w-16 flex-shrink-0">중요도</span>
              <div className="flex gap-1.5">
                {PRIORITY_OPTIONS.map((p) => (
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
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Due Date */}
            <div className="flex items-center gap-3">
              <span className="text-text-muted text-xs w-16 flex-shrink-0">마감일</span>
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="date"
                  value={task.dueDate ?? ''}
                  onChange={(e) => onUpdate({ dueDate: e.target.value || null })}
                  className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-[#e94560] transition-colors"
                />
                {task.dueDate && (
                  <button
                    onClick={() => onUpdate({ dueDate: null })}
                    className="text-text-muted hover:text-[#e94560] text-sm transition-colors"
                    title="마감일 제거"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {/* Reminder */}
            <div className="flex items-center gap-3">
              <span className="text-text-muted text-xs w-16 flex-shrink-0">알림</span>
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="datetime-local"
                  value={task.reminder ?? ''}
                  onChange={(e) => onUpdate({ reminder: e.target.value || null })}
                  className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-[#e94560] transition-colors"
                />
                {task.reminder && (
                  <button
                    onClick={() => onUpdate({ reminder: null })}
                    className="text-text-muted hover:text-[#e94560] text-sm transition-colors"
                    title="알림 제거"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ── Sub-tasks ───────────────────────────────────────────────────── */}
          <div className="px-5 py-4 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm">📋</span>
                <span className="text-xs font-bold text-text-primary">하위 할일</span>
                {subTasks.length > 0 && (
                  <span className="text-[10px] text-text-muted">
                    {completedSubCount}/{subTasks.length}
                  </span>
                )}
              </div>
            </div>

            {/* Progress bar */}
            {subTasks.length > 0 && (
              <div className="h-1 bg-border rounded-full overflow-hidden mb-3">
                <div
                  className="h-full bg-gradient-to-r from-[#e94560] to-[#8b5cf6] rounded-full transition-all duration-300"
                  style={{ width: `${(completedSubCount / subTasks.length) * 100}%` }}
                />
              </div>
            )}

            {/* Sub-task list */}
            <div className="space-y-1 mb-3">
              {subTasks.map((sub) => (
                <div
                  key={sub.id}
                  className="flex items-center gap-2.5 group py-1 px-2 -mx-2 rounded-lg hover:bg-border/30 transition-colors"
                >
                  <button
                    onClick={() => toggleSubTask(sub.id)}
                    className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                      sub.completed
                        ? 'bg-gradient-to-br from-[#e94560] to-[#8b5cf6] border-transparent'
                        : 'border-text-secondary/40 hover:border-[#e94560]'
                    }`}
                  >
                    {sub.completed && (
                      <svg width="8" height="8" viewBox="0 0 14 14" fill="none">
                        <path d="M3 7L6 10L11 4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                  <span
                    className={`flex-1 text-xs ${
                      sub.completed ? 'line-through text-text-inactive' : 'text-text-primary'
                    }`}
                  >
                    {sub.title}
                  </span>
                  <button
                    onClick={() => deleteSubTask(sub.id)}
                    className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center text-text-muted hover:text-[#e94560] transition-all text-sm"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {/* Add sub-task input */}
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded border-2 border-dashed border-border flex-shrink-0" />
              <input
                ref={subTaskInputRef}
                type="text"
                value={subTaskInput}
                onChange={(e) => setSubTaskInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addSubTask();
                  if (e.key === 'Escape') setSubTaskInput('');
                }}
                placeholder="하위 할일 추가..."
                className="flex-1 bg-transparent text-xs text-text-primary placeholder-text-inactive outline-none"
              />
              {subTaskInput.trim() && (
                <button
                  onClick={addSubTask}
                  className="text-[10px] px-2 py-0.5 bg-[#e94560] text-white rounded font-semibold"
                >
                  추가
                </button>
              )}
            </div>
          </div>

          {/* ── Memo ────────────────────────────────────────────────────────── */}
          <div className="px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm">📝</span>
              <span className="text-xs font-bold text-text-primary">메모</span>
            </div>
            <textarea
              value={memoValue}
              onChange={(e) => handleMemoChange(e.target.value)}
              placeholder="메모를 입력하세요..."
              rows={4}
              className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-xs text-text-primary placeholder-text-inactive resize-none focus:outline-none focus:border-[#e94560] transition-colors leading-relaxed"
            />
          </div>

          {/* ── Attachments ─────────────────────────────────────────────────── */}
          <div className="px-5 py-4 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm">📎</span>
                <span className="text-xs font-bold text-text-primary">파일 첨부</span>
                {attachments.length > 0 && (
                  <span className="text-[10px] text-text-muted">{attachments.length}개</span>
                )}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-[10px] px-2.5 py-1 border border-border rounded-lg text-text-secondary hover:border-[#e94560] hover:text-[#e94560] transition-colors font-semibold"
              >
                + 파일 추가
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            {attachments.length === 0 ? (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-4 border-2 border-dashed border-border rounded-lg text-center text-text-inactive text-xs hover:border-[#e94560]/40 hover:text-text-muted transition-colors"
              >
                파일을 끌어다 놓거나 클릭하여 추가
              </button>
            ) : (
              <div className="space-y-1.5">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center gap-2.5 p-2 bg-background rounded-lg border border-border group"
                  >
                    <span className="text-lg flex-shrink-0">
                      {att.type.startsWith('image/') ? '🖼️' :
                       att.type.includes('pdf') ? '📄' :
                       att.type.includes('word') || att.type.includes('document') ? '📝' :
                       att.type.includes('sheet') || att.type.includes('excel') ? '📊' :
                       '📎'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-text-primary truncate font-medium">{att.name}</p>
                      <p className="text-[10px] text-text-muted">
                        {formatFileSize(att.size)} · {formatDate(att.addedAt)}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteAttachment(att.id)}
                      className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center text-text-muted hover:text-[#e94560] transition-all"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Status ──────────────────────────────────────────────────────── */}
          <div className="px-5 py-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm">⚙️</span>
              <span className="text-xs font-bold text-text-primary">상태</span>
            </div>
            <div className="flex gap-2">
              {(['todo', 'in_progress', 'completed'] as const).map((s) => {
                const labels = { todo: '할 일', in_progress: '진행 중', completed: '완료' };
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
        </div>

        {/* Footer – Delete */}
        <div className="px-5 py-4 border-t border-border flex-shrink-0">
          <button
            onClick={() => {
              if (confirm('이 할일을 삭제할까요?')) {
                onDelete();
                onClose();
              }
            }}
            className="w-full py-2.5 rounded-xl border border-[#e94560]/30 text-[#e94560] text-sm font-semibold hover:bg-[#e94560]/10 transition-colors"
          >
            할일 삭제
          </button>
        </div>
      </div>
    </>
  );
}
