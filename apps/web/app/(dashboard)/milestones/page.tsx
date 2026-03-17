'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import {
  getFirestore,
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import FloatingAIBar from '@/components/ai/FloatingAIBar';

type Status = 'upcoming' | 'in-progress' | 'completed' | 'overdue';
type View = 'list' | 'timeline';

interface Milestone {
  id: string;
  title: string;
  description: string;
  dueDate: string;      // 'YYYY-MM-DD'
  startDate: string;    // 'YYYY-MM-DD'
  progress: number;     // 0-100
  status: Status;
  color: string;
  createdAt: Timestamp;
}

const COLORS = ['#e94560', '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#84cc16'];

const STATUS_META: Record<Status, { label: string; bg: string; text: string; dot: string }> = {
  upcoming:    { label: '예정', bg: 'bg-blue-500/10',   text: 'text-blue-400',   dot: 'bg-blue-400' },
  'in-progress': { label: '진행중', bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-400 animate-pulse' },
  completed:   { label: '완료', bg: 'bg-green-500/10',  text: 'text-green-400',  dot: 'bg-green-400' },
  overdue:     { label: '지연', bg: 'bg-red-500/10',    text: 'text-red-400',    dot: 'bg-red-400' },
};

function today() { return new Date().toISOString().slice(0, 10); }

function daysUntil(dateStr: string): number {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const due = new Date(dateStr);
  return Math.round((due.getTime() - now.getTime()) / 86400000);
}

function deriveStatus(m: Omit<Milestone, 'id' | 'createdAt'>): Status {
  if (m.status === 'completed') return 'completed';
  if (!m.dueDate) return 'upcoming';
  const days = daysUntil(m.dueDate);
  if (days < 0) return 'overdue';
  if (m.progress > 0) return 'in-progress';
  return 'upcoming';
}

// ── Modal ──────────────────────────────────────────────────────────────────────
function MilestoneModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: Partial<Milestone>;
  onSave: (data: Omit<Milestone, 'id' | 'createdAt'>) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [startDate, setStartDate] = useState(initial?.startDate ?? today());
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? '');
  const [progress, setProgress] = useState(initial?.progress ?? 0);
  const [color, setColor] = useState(initial?.color ?? COLORS[0]);
  const [status, setStatus] = useState<Status>(initial?.status ?? 'upcoming');

  const handleSave = () => {
    if (!title.trim()) return;
    const data = { title: title.trim(), description, startDate, dueDate, progress, color, status };
    onSave({ ...data, status: deriveStatus(data) });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-background-card border border-border rounded-2xl w-full max-w-md shadow-2xl">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h3 className="text-base font-bold text-text-primary">
            {initial?.id ? '마일스톤 편집' : '새 마일스톤'}
          </h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary text-lg transition-colors">×</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Title */}
          <div>
            <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold block mb-1.5">제목 *</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
              placeholder="마일스톤 이름을 입력하세요"
              autoFocus
              className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm text-text-primary outline-none focus:border-[#e94560] transition-colors placeholder:text-text-muted"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold block mb-1.5">설명</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="마일스톤에 대한 설명..."
              rows={2}
              className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm text-text-primary outline-none focus:border-[#e94560] transition-colors placeholder:text-text-muted resize-none"
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold block mb-1.5">시작일</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-text-primary outline-none focus:border-[#e94560] transition-colors"
              />
            </div>
            <div>
              <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold block mb-1.5">마감일</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-text-primary outline-none focus:border-[#e94560] transition-colors"
              />
            </div>
          </div>

          {/* Progress */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">진행률</label>
              <span className="text-xs font-bold" style={{ color }}>{progress}%</span>
            </div>
            <input
              type="range" min={0} max={100} value={progress}
              onChange={e => setProgress(Number(e.target.value))}
              className="w-full accent-[#e94560]"
            />
            <div className="flex gap-1 mt-2">
              {[0, 25, 50, 75, 100].map(v => (
                <button
                  key={v}
                  onClick={() => setProgress(v)}
                  className={`flex-1 py-1 rounded-lg text-[10px] font-bold transition-colors ${
                    progress === v ? 'bg-[#e94560] text-white' : 'bg-border/40 text-text-muted hover:bg-border'
                  }`}
                >
                  {v}%
                </button>
              ))}
            </div>
          </div>

          {/* Status override */}
          {initial?.id && (
            <div>
              <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold block mb-1.5">상태</label>
              <div className="flex gap-2 flex-wrap">
                {(Object.keys(STATUS_META) as Status[]).map(s => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      status === s
                        ? `${STATUS_META[s].bg} ${STATUS_META[s].text} border border-current/20`
                        : 'bg-border/40 text-text-muted hover:bg-border'
                    }`}
                  >
                    {STATUS_META[s].label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Color */}
          <div>
            <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold block mb-2">색상</label>
            <div className="flex gap-2">
              {COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-transform ${color === c ? 'scale-110' : 'hover:scale-105'}`}
                  style={{ background: c, outline: color === c ? `2px solid ${c}` : 'none', outlineOffset: '2px' }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-border flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-border/40 text-text-secondary text-sm font-semibold hover:bg-border transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim()}
            className="px-5 py-2.5 rounded-xl bg-[#e94560] text-white text-sm font-bold hover:bg-[#d63b55] disabled:opacity-50 transition-colors"
          >
            {initial?.id ? '저장' : '추가'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Progress Ring ─────────────────────────────────────────────────────────────
function ProgressRing({ value, color, size = 56 }: { value: number; color: string; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  return (
    <svg width={size} height={size} className="flex-shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={4} className="stroke-border" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={4}
        stroke={color} strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" className="transition-all duration-500"
      />
      <text
        x={size / 2} y={size / 2}
        textAnchor="middle" dominantBaseline="middle"
        className="rotate-90 fill-text-primary text-[10px] font-bold"
        style={{ transform: `rotate(90deg) translate(0, 0)`, transformOrigin: `${size/2}px ${size/2}px`, fontSize: 11 }}
      >
        {value}%
      </text>
    </svg>
  );
}

// ── Timeline View ─────────────────────────────────────────────────────────────
function TimelineView({ milestones }: { milestones: Milestone[] }) {
  const sorted = [...milestones].sort((a, b) => {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  });

  return (
    <div className="relative pl-6">
      <div className="absolute left-2.5 top-2 bottom-2 w-0.5 bg-border rounded-full" />
      <div className="space-y-4">
        {sorted.map((m, i) => {
          const sm = STATUS_META[m.status];
          const days = m.dueDate ? daysUntil(m.dueDate) : null;
          return (
            <div key={m.id} className="relative flex gap-4">
              <div
                className="absolute -left-6 top-3.5 w-3 h-3 rounded-full border-2 border-background-card"
                style={{ background: m.color }}
              />
              <div className="flex-1 bg-background-card border border-border rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sm.bg} ${sm.text}`}>{sm.label}</span>
                      {days !== null && (
                        <span className={`text-[10px] ${days < 0 ? 'text-red-400' : days <= 7 ? 'text-amber-400' : 'text-text-muted'}`}>
                          {days < 0 ? `${Math.abs(days)}일 지남` : days === 0 ? '오늘 마감' : `${days}일 남음`}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-bold text-text-primary truncate">{m.title}</p>
                    {m.description && <p className="text-xs text-text-muted mt-0.5 line-clamp-1">{m.description}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-bold" style={{ color: m.color }}>{m.progress}%</p>
                    {m.dueDate && <p className="text-[10px] text-text-muted">{m.dueDate}</p>}
                  </div>
                </div>
                {/* Progress bar */}
                <div className="mt-3 h-1.5 bg-border/40 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${m.progress}%`, background: m.color }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MilestonesPage() {
  const { user } = useAuth();
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Milestone | null>(null);
  const [view, setView] = useState<View>('list');
  const [filterStatus, setFilterStatus] = useState<Status | 'all'>('all');

  const db = getFirestore();

  useEffect(() => {
    if (!user) return;
    const ref = collection(db, 'users', user.uid, 'milestones');
    const q = query(ref, orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, snap => {
      setMilestones(snap.docs.map(d => ({ id: d.id, ...d.data() } as Milestone)));
      setLoading(false);
    });
    return unsub;
  }, [user, db]);

  const handleSave = useCallback(async (data: Omit<Milestone, 'id' | 'createdAt'>) => {
    if (!user) return;
    const ref = collection(db, 'users', user.uid, 'milestones');
    if (editTarget) {
      await updateDoc(doc(db, 'users', user.uid, 'milestones', editTarget.id), { ...data });
    } else {
      await addDoc(ref, { ...data, createdAt: serverTimestamp() });
    }
    setShowModal(false);
    setEditTarget(null);
  }, [user, db, editTarget]);

  const handleDelete = useCallback(async (id: string) => {
    if (!user || !confirm('이 마일스톤을 삭제할까요?')) return;
    await deleteDoc(doc(db, 'users', user.uid, 'milestones', id));
  }, [user, db]);

  const handleProgressChange = useCallback(async (m: Milestone, newProgress: number) => {
    if (!user) return;
    const newStatus = deriveStatus({ ...m, progress: newProgress, status: m.status });
    await updateDoc(doc(db, 'users', user.uid, 'milestones', m.id), {
      progress: newProgress,
      status: newStatus,
    });
  }, [user, db]);

  const handleMarkComplete = useCallback(async (m: Milestone) => {
    if (!user) return;
    await updateDoc(doc(db, 'users', user.uid, 'milestones', m.id), {
      progress: 100,
      status: 'completed',
    });
  }, [user, db]);

  const filtered = filterStatus === 'all'
    ? milestones
    : milestones.filter(m => m.status === filterStatus);

  // Stats
  const total = milestones.length;
  const completed = milestones.filter(m => m.status === 'completed').length;
  const inProgress = milestones.filter(m => m.status === 'in-progress').length;
  const overdue = milestones.filter(m => m.status === 'overdue').length;
  const avgProgress = total ? Math.round(milestones.reduce((s, m) => s + m.progress, 0) / total) : 0;

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🏁</span>
            <div>
              <h2 className="text-2xl font-extrabold text-text-primary">마일스톤</h2>
              <p className="text-xs text-text-muted mt-0.5">프로젝트 목표와 진행 상황을 관리하세요</p>
            </div>
          </div>
          <button
            onClick={() => { setEditTarget(null); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#e94560] text-white rounded-xl text-sm font-bold hover:bg-[#d63b55] transition-colors"
          >
            <span className="text-base leading-none">+</span>
            새 마일스톤
          </button>
        </div>

        {/* Stats row */}
        {total > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: '전체', value: total, color: 'text-text-primary' },
              { label: '진행중', value: inProgress, color: 'text-amber-400' },
              { label: '완료', value: completed, color: 'text-green-400' },
              { label: '평균 진행률', value: `${avgProgress}%`, color: 'text-[#e94560]' },
            ].map(s => (
              <div key={s.label} className="bg-background-card border border-border rounded-xl p-4 text-center">
                <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-text-muted mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Toolbar */}
        {total > 0 && (
          <div className="flex items-center gap-3 flex-wrap">
            {/* View toggle */}
            <div className="flex gap-1 p-1 bg-border/30 rounded-xl">
              {(['list', 'timeline'] as View[]).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    view === v ? 'bg-background-card text-text-primary shadow-sm' : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  {v === 'list' ? '📋 목록' : '📅 타임라인'}
                </button>
              ))}
            </div>

            {/* Status filter */}
            <div className="flex gap-1 flex-wrap">
              {(['all', ...Object.keys(STATUS_META)] as (Status | 'all')[]).map(s => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    filterStatus === s
                      ? 'bg-[#e94560]/10 text-[#e94560] border border-[#e94560]/30'
                      : 'bg-border/30 text-text-muted hover:text-text-primary'
                  }`}
                >
                  {s === 'all' ? '전체' : STATUS_META[s].label}
                  {s !== 'all' && (
                    <span className="ml-1 opacity-70">
                      {milestones.filter(m => m.status === s).length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <span className="w-6 h-6 border-2 border-[#e94560] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <div className="text-5xl">🏁</div>
            <p className="text-base font-semibold text-text-primary">
              {total === 0 ? '마일스톤이 없습니다' : '해당하는 마일스톤이 없습니다'}
            </p>
            <p className="text-sm text-text-muted">
              {total === 0 ? '+ 새 마일스톤을 추가해 프로젝트 목표를 설정하세요' : '필터를 변경해보세요'}
            </p>
            {total === 0 && (
              <button
                onClick={() => { setEditTarget(null); setShowModal(true); }}
                className="mt-2 px-5 py-2.5 bg-[#e94560] text-white rounded-xl text-sm font-bold hover:bg-[#d63b55] transition-colors"
              >
                첫 번째 마일스톤 만들기
              </button>
            )}
          </div>
        ) : view === 'timeline' ? (
          <TimelineView milestones={filtered} />
        ) : (
          <div className="space-y-3">
            {filtered.map(m => {
              const sm = STATUS_META[m.status];
              const days = m.dueDate ? daysUntil(m.dueDate) : null;
              return (
                <div key={m.id} className="bg-background-card border border-border rounded-2xl p-5 group">
                  <div className="flex items-start gap-4">
                    {/* Progress ring */}
                    <ProgressRing value={m.progress} color={m.color} size={52} />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h3 className="text-sm font-bold text-text-primary truncate">{m.title}</h3>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${sm.bg} ${sm.text}`}>
                              {sm.label}
                            </span>
                          </div>
                          {m.description && (
                            <p className="text-xs text-text-muted line-clamp-1 mb-2">{m.description}</p>
                          )}
                          <div className="flex items-center gap-4 text-xs text-text-muted flex-wrap">
                            {m.startDate && <span>시작: {m.startDate}</span>}
                            {m.dueDate && (
                              <span className={days !== null && days < 0 ? 'text-red-400 font-semibold' : days !== null && days <= 3 ? 'text-amber-400' : ''}>
                                마감: {m.dueDate}
                                {days !== null && (
                                  <span className="ml-1">
                                    ({days < 0 ? `${Math.abs(days)}일 지남` : days === 0 ? '오늘' : `${days}일 남음`})
                                  </span>
                                )}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          {m.status !== 'completed' && (
                            <button
                              onClick={() => handleMarkComplete(m)}
                              title="완료 처리"
                              className="w-7 h-7 flex items-center justify-center rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 text-sm transition-colors"
                            >
                              ✓
                            </button>
                          )}
                          <button
                            onClick={() => { setEditTarget(m); setShowModal(true); }}
                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-border/40 text-text-muted hover:text-text-primary hover:bg-border transition-colors text-xs"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDelete(m.id)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors text-xs"
                          >
                            ×
                          </button>
                        </div>
                      </div>

                      {/* Progress bar + quick slider */}
                      <div className="mt-3 space-y-1">
                        <div className="h-2 bg-border/30 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${m.progress}%`, background: m.color }}
                          />
                        </div>
                        <input
                          type="range" min={0} max={100} value={m.progress}
                          onChange={e => handleProgressChange(m, Number(e.target.value))}
                          className="w-full h-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          style={{ accentColor: m.color }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Overdue warning */}
        {overdue > 0 && (
          <div className="flex items-center gap-3 p-3.5 bg-red-500/5 border border-red-500/20 rounded-xl">
            <span className="text-red-400 text-lg">⚠️</span>
            <p className="text-xs text-red-400">
              <span className="font-bold">{overdue}개</span>의 마일스톤이 마감일을 초과했습니다.
            </p>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <MilestoneModal
          initial={editTarget ?? undefined}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditTarget(null); }}
        />
      )}

      <FloatingAIBar
        getAction={() => 'chat'}
        getContext={(text) => ({ page: 'milestones', userMessage: text })}
        onResult={async () => {}}
        placeholder="마일스톤에 대해 AI에게 질문하세요..."
      />
    </div>
  );
}
