'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, Timestamp } from 'firebase/firestore';
import FloatingAIBar from '@/components/ai/FloatingAIBar';

const DAYS = ['월', '화', '수', '목', '금', '토', '일'];
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const HOURS = Array.from({ length: 16 }, (_, i) => i + 7); // 07:00 ~ 22:00

const COLORS = [
  '#e94560', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6',
  '#06b6d4', '#f97316', '#ec4899', '#10b981', '#6366f1',
];

interface TimetableSlot {
  id: string;
  name: string;
  color: string;
  days: string[]; // day keys
  startHour: number;
  startMin: number; // 0 or 30
  endHour: number;
  endMin: number; // 0 or 30
  memo?: string;
  createdAt: Timestamp;
}

const db = getFirestore();

function slotRef(uid: string) {
  return collection(db, 'users', uid, 'timetable');
}

const toMinutes = (h: number, m: number) => h * 60 + m;

export default function TimetablePage() {
  const { user } = useAuth();
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editSlot, setEditSlot] = useState<TimetableSlot | null>(null);

  // 폼 상태
  const [name, setName] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [selectedDays, setSelectedDays] = useState<string[]>(['mon']);
  const [startHour, setStartHour] = useState(9);
  const [startMin, setStartMin] = useState(0);
  const [endHour, setEndHour] = useState(10);
  const [endMin, setEndMin] = useState(0);
  const [memo, setMemo] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const snap = await getDocs(slotRef(user.uid));
      setSlots(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TimetableSlot)));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setName(''); setSelectedColor(COLORS[0]); setSelectedDays(['mon']);
    setStartHour(9); setStartMin(0); setEndHour(10); setEndMin(0); setMemo('');
    setEditSlot(null);
  };

  const openForm = (slot?: TimetableSlot) => {
    if (slot) {
      setName(slot.name); setSelectedColor(slot.color); setSelectedDays(slot.days);
      setStartHour(slot.startHour); setStartMin(slot.startMin);
      setEndHour(slot.endHour); setEndMin(slot.endMin); setMemo(slot.memo || '');
      setEditSlot(slot);
    } else {
      resetForm();
    }
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!user || !name.trim() || selectedDays.length === 0) return;
    const data = {
      name: name.trim(), color: selectedColor, days: selectedDays,
      startHour, startMin, endHour, endMin, memo,
      createdAt: Timestamp.now(),
    };
    if (editSlot) {
      await deleteDoc(doc(db, 'users', user.uid, 'timetable', editSlot.id));
    }
    await addDoc(slotRef(user.uid), data);
    setShowForm(false);
    resetForm();
    load();
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    await deleteDoc(doc(db, 'users', user.uid, 'timetable', id));
    setSlots((prev) => prev.filter((s) => s.id !== id));
  };

  // 시간표 셀에 들어갈 슬롯 찾기
  const getSlotsForCell = (dayKey: string, hour: number, minute: number) => {
    const cellMin = toMinutes(hour, minute);
    return slots.filter((s) => {
      if (!s.days.includes(dayKey)) return false;
      const start = toMinutes(s.startHour, s.startMin);
      const end = toMinutes(s.endHour, s.endMin);
      return cellMin >= start && cellMin < end;
    });
  };

  const isSlotStart = (slot: TimetableSlot, hour: number, minute: number) =>
    slot.startHour === hour && slot.startMin === minute;

  const getSlotHeight = (slot: TimetableSlot) => {
    const dur = toMinutes(slot.endHour, slot.endMin) - toMinutes(slot.startHour, slot.startMin);
    return Math.max(1, dur / 30); // # of 30-min cells
  };

  const fmtTime = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 md:px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-text-primary">📅 시간표</h1>
          <button
            onClick={() => openForm()}
            className="px-4 py-2 bg-[#e94560] text-white text-sm font-semibold rounded-xl hover:bg-[#d63651] transition-colors"
          >
            + 시간 추가
          </button>
        </div>
      </div>

      {/* 시간표 그리드 */}
      <div className="flex-1 overflow-auto px-2 py-4">
        <div className="min-w-[600px]">
          {/* 요일 헤더 */}
          <div className="grid sticky top-0 z-10 bg-background mb-1" style={{ gridTemplateColumns: '44px repeat(7, 1fr)' }}>
            <div />
            {DAYS.map((d, i) => (
              <div
                key={d}
                className={`text-center text-xs font-semibold py-2 ${
                  i >= 5 ? 'text-[#e94560]' : 'text-text-secondary'
                }`}
              >
                {d}
              </div>
            ))}
          </div>

          {/* 시간 슬롯 */}
          {loading ? (
            <div className="text-center py-12 text-text-muted text-sm">불러오는 중...</div>
          ) : (
            HOURS.map((hour) =>
              [0, 30].map((min) => {
                const isHourStart = min === 0;
                return (
                  <div
                    key={`${hour}-${min}`}
                    className="grid"
                    style={{ gridTemplateColumns: '44px repeat(7, 1fr)', minHeight: 32 }}
                  >
                    {/* 시간 레이블 */}
                    <div className={`text-right pr-2 text-[10px] text-text-muted select-none ${isHourStart ? '' : 'opacity-0'}`}>
                      {fmtTime(hour, min)}
                    </div>

                    {/* 각 요일 셀 */}
                    {DAY_KEYS.map((dayKey) => {
                      const cellSlots = getSlotsForCell(dayKey, hour, min);
                      return (
                        <div
                          key={dayKey}
                          className={`border-l border-border relative ${isHourStart ? 'border-t' : 'border-t border-dashed border-border/40'} hover:bg-border/10 cursor-pointer`}
                          style={{ minHeight: 32 }}
                          onClick={() => {
                            setStartHour(hour); setStartMin(min);
                            setEndHour(min === 30 ? hour + 1 : hour); setEndMin(min === 30 ? 0 : 30);
                            setSelectedDays([dayKey]);
                            openForm();
                          }}
                        >
                          {cellSlots.map((slot) => {
                            if (!isSlotStart(slot, hour, min)) return null;
                            const height = getSlotHeight(slot) * 32;
                            return (
                              <div
                                key={slot.id}
                                className="absolute inset-x-0.5 rounded-md z-10 px-1.5 overflow-hidden cursor-pointer group"
                                style={{
                                  backgroundColor: slot.color + 'cc',
                                  height: height - 2,
                                  top: 1,
                                }}
                                onClick={(e) => { e.stopPropagation(); openForm(slot); }}
                              >
                                <p className="text-white text-[10px] font-semibold truncate leading-tight mt-0.5">{slot.name}</p>
                                {height > 40 && (
                                  <p className="text-white/70 text-[9px]">{fmtTime(slot.startHour, slot.startMin)}~{fmtTime(slot.endHour, slot.endMin)}</p>
                                )}
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDelete(slot.id); }}
                                  className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 text-white/80 hover:text-white text-xs leading-none"
                                >×</button>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                    <div className="border-l border-border" />
                  </div>
                );
              })
            )
          )}
        </div>
      </div>

      {/* 추가/편집 모달 */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-4">
          <div className="bg-background border border-border rounded-2xl w-full max-w-sm p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-text-primary">{editSlot ? '수업 편집' : '수업 추가'}</h2>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="text-text-muted hover:text-text-primary">✕</button>
            </div>

            {/* 이름 */}
            <div>
              <label className="text-xs text-text-muted block mb-1">수업/일정 이름</label>
              <input
                type="text"
                placeholder="예: 수학, 영어, 헬스..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-background-card border border-border rounded-xl px-3 py-2 text-sm text-text-primary"
                autoFocus
              />
            </div>

            {/* 색상 */}
            <div>
              <label className="text-xs text-text-muted block mb-1">색상</label>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setSelectedColor(c)}
                    className={`w-7 h-7 rounded-full transition-transform ${selectedColor === c ? 'scale-125 ring-2 ring-white ring-offset-1' : ''}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            {/* 요일 */}
            <div>
              <label className="text-xs text-text-muted block mb-1">요일 (복수 선택)</label>
              <div className="flex gap-1.5">
                {DAYS.map((d, i) => (
                  <button
                    key={d}
                    onClick={() => {
                      const key = DAY_KEYS[i];
                      setSelectedDays((prev) =>
                        prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]
                      );
                    }}
                    className={`w-9 h-9 rounded-full text-xs font-semibold transition-all ${
                      selectedDays.includes(DAY_KEYS[i])
                        ? 'text-white'
                        : 'bg-background-card border border-border text-text-secondary'
                    }`}
                    style={selectedDays.includes(DAY_KEYS[i]) ? { backgroundColor: selectedColor } : {}}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {/* 시간 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-text-muted block mb-1">시작 시간</label>
                <select
                  value={`${startHour}:${startMin}`}
                  onChange={(e) => {
                    const [h, m] = e.target.value.split(':').map(Number);
                    setStartHour(h); setStartMin(m);
                  }}
                  className="w-full bg-background-card border border-border rounded-xl px-2 py-2 text-sm text-text-primary"
                >
                  {HOURS.map((h) => [0, 30].map((m) => (
                    <option key={`${h}:${m}`} value={`${h}:${m}`}>{fmtTime(h, m)}</option>
                  )))}
                </select>
              </div>
              <div>
                <label className="text-xs text-text-muted block mb-1">종료 시간</label>
                <select
                  value={`${endHour}:${endMin}`}
                  onChange={(e) => {
                    const [h, m] = e.target.value.split(':').map(Number);
                    setEndHour(h); setEndMin(m);
                  }}
                  className="w-full bg-background-card border border-border rounded-xl px-2 py-2 text-sm text-text-primary"
                >
                  {HOURS.map((h) => [0, 30].map((m) => (
                    <option key={`${h}:${m}`} value={`${h}:${m}`}>{fmtTime(h, m)}</option>
                  )))}
                  <option value="23:0">23:00</option>
                </select>
              </div>
            </div>

            {/* 메모 */}
            <div>
              <label className="text-xs text-text-muted block mb-1">메모 (선택)</label>
              <input
                type="text"
                placeholder="강의실, 선생님, 준비물..."
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                className="w-full bg-background-card border border-border rounded-xl px-3 py-2 text-sm text-text-primary"
              />
            </div>

            <div className="flex gap-2">
              {editSlot && (
                <button
                  onClick={() => { handleDelete(editSlot.id); setShowForm(false); resetForm(); }}
                  className="flex-1 py-2.5 rounded-xl border border-[#e94560] text-[#e94560] text-sm font-medium"
                >
                  삭제
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={!name.trim() || selectedDays.length === 0}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-40"
                style={{ backgroundColor: selectedColor }}
              >
                {editSlot ? '저장' : '추가'}
              </button>
            </div>
          </div>
        </div>
      )}

      <FloatingAIBar
        commands={[
          { label: '시간 추가', icon: '📅', desc: '수업/일정을 시간표에 추가' },
          { label: '시간표 분석', icon: '📊', desc: 'AI가 시간표를 분석해드립니다' },
          { label: '빈 시간 찾기', icon: '🔍', desc: '비어있는 시간대를 알려드립니다' },
        ]}
        getAction={() => 'chat'}
        getContext={() => ({
          page: 'timetable',
          slots: slots.map(s =>
            `${s.name}: ${DAYS.filter((_, i) => s.days.includes(DAY_KEYS[i])).join(',')} ${String(s.startHour).padStart(2,'0')}:${String(s.startMin).padStart(2,'0')}~${String(s.endHour).padStart(2,'0')}:${String(s.endMin).padStart(2,'0')}${s.memo ? ' (' + s.memo + ')' : ''}`
          ).join('\n'),
          totalSlots: slots.length,
        })}
        onResult={() => {}}
        placeholder="시간표에 대해 질문하거나 일정을 추가해보세요..."
      />
    </div>
  );
}
