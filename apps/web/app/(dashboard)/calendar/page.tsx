'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n-context';
import { useDataStore } from '@/lib/data-store';
import {
  getCalendarEvents,
  addCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  type CalendarEvent,
  type TaskData,
} from '@/lib/firestore';
import {
  getStoredGCalToken,
  connectGoogleCalendar,
  connectGoogleCalendarDesktop,
  connectGoogleCalendarRedirect,
  checkGCalRedirectResult,
  disconnectGoogleCalendar,
  fetchGCalEvents,
  gcalColor,
  type GCalEvent,
} from '@/lib/google-calendar';

interface GCalDisplayEvent {
  id: string;
  title: string;
  color: string;
  dateStr: string;
  endDateStr: string;
  startTime?: string;
  isGcal: true;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function todayStr() { return toDateStr(new Date()); }

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay(); // 0=Sun
}

const EVENT_COLORS = ['#e94560', '#8b5cf6', '#06b6d4', '#22c55e', '#f59e0b', '#ec4899', '#6366f1', '#14b8a6'];

// ── Event Form Modal ─────────────────────────────────────────────────────────

function EventModal({
  event,
  defaultDate,
  onSave,
  onDelete,
  onClose,
  t,
}: {
  event?: CalendarEvent | null;
  defaultDate: string;
  onSave: (data: Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
  t: (key: string) => string;
}) {
  const [title, setTitle] = useState(event?.title || '');
  const [date, setDate] = useState(event?.date || defaultDate);
  const [endDate, setEndDate] = useState(event?.endDate || event?.date || defaultDate);
  const [allDay, setAllDay] = useState(event?.allDay ?? true);
  const [startTime, setStartTime] = useState(event?.startTime || '09:00');
  const [endTime, setEndTime] = useState(event?.endTime || '10:00');
  const [color, setColor] = useState(event?.color || '#e94560');
  const [memo, setMemo] = useState(event?.memo || '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave({
        title: title.trim(),
        date,
        endDate: endDate > date ? endDate : undefined,
        allDay,
        startTime: allDay ? undefined : startTime,
        endTime: allDay ? undefined : endTime,
        color,
        memo: memo.trim() || undefined,
      });
    } catch {
      setSaveError('저장 중 오류가 발생했습니다. 다시 시도해주세요.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-background-card border border-border rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-text-primary">
          {event ? t('calendar.editEvent') : t('calendar.newEvent')}
        </h3>

        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={t('calendar.eventTitle')}
          autoFocus
          className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-text-primary outline-none focus:border-[#e94560] transition-colors"
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
        />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold block mb-1">{t('calendar.startDate')}</label>
            <input type="date" value={date} onChange={e => { setDate(e.target.value); if (e.target.value > endDate) setEndDate(e.target.value); }}
              className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm text-text-primary outline-none focus:border-[#e94560]" />
          </div>
          <div>
            <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold block mb-1">{t('calendar.endDate')}</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} min={date}
              className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm text-text-primary outline-none focus:border-[#e94560]" />
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)}
            className="w-4 h-4 rounded accent-[#e94560]" />
          <span className="text-sm text-text-secondary">{t('calendar.allDay')}</span>
        </label>

        {!allDay && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold block mb-1">{t('calendar.startTime')}</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm text-text-primary outline-none focus:border-[#e94560]" />
            </div>
            <div>
              <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold block mb-1">{t('calendar.endTime')}</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm text-text-primary outline-none focus:border-[#e94560]" />
            </div>
          </div>
        )}

        <div>
          <label className="text-[10px] text-text-muted uppercase tracking-wider font-semibold block mb-1.5">{t('calendar.color')}</label>
          <div className="flex gap-2">
            {EVENT_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                className={`w-7 h-7 rounded-full transition-all ${color === c ? 'ring-2 ring-offset-2 ring-offset-background-card scale-110' : 'hover:scale-110'}`}
                style={{ backgroundColor: c, ['--tw-ring-color' as string]: c }} />
            ))}
          </div>
        </div>

        <textarea
          value={memo}
          onChange={e => setMemo(e.target.value)}
          placeholder="Memo..."
          rows={2}
          className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm text-text-primary outline-none focus:border-[#e94560] resize-none"
        />

        {saveError && (
          <p className="text-xs text-red-400 text-center">{saveError}</p>
        )}
        <div className="flex items-center justify-between pt-2">
          {event && onDelete ? (
            <button onClick={() => onDelete()} className="text-xs text-red-400 hover:text-red-300 transition-colors">
              {t('calendar.deleteEvent')}
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors disabled:opacity-40">
              {t('common.cancel')}
            </button>
            <button onClick={handleSave} disabled={!title.trim() || saving}
              className="px-5 py-2 bg-[#e94560] text-white rounded-xl text-sm font-bold hover:bg-[#d63b55] disabled:opacity-40 transition-all flex items-center gap-1.5">
              {saving && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />}
              {t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Calendar Page ───────────────────────────────────────────────────────

export default function CalendarPage() {
  const { user } = useAuth();
  const { t, language } = useI18n();
  const { tasks } = useDataStore();
  const dateLocale = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', es: 'es-ES', pt: 'pt-BR', fr: 'fr-FR' }[language] ?? 'en-US';

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const initialLoad = useRef(true);

  // Google Calendar state
  const [gcalToken, setGcalToken] = useState<string | null>(null);
  const [gcalDisplayEvents, setGcalDisplayEvents] = useState<GCalDisplayEvent[]>([]);
  const [gcalLoading, setGcalLoading] = useState(false);
  const [gcalError, setGcalError] = useState<string | null>(null);

  // Normalize a GCalEvent into GCalDisplayEvent array entries (handles multi-day)
  const normalizeGCalEvents = useCallback((raw: GCalEvent[]): GCalDisplayEvent[] => {
    return raw.map(ev => {
      const startDate = ev.start.date ?? ev.start.dateTime?.slice(0, 10) ?? '';
      let endDate = ev.end.date ?? ev.end.dateTime?.slice(0, 10) ?? startDate;
      // Google all-day end.date is exclusive — subtract 1 day
      if (ev.end.date) {
        const d = new Date(ev.end.date + 'T00:00:00');
        d.setDate(d.getDate() - 1);
        endDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
      const startTime = ev.start.dateTime
        ? ev.start.dateTime.slice(11, 16)
        : undefined;
      return {
        id: ev.id,
        title: ev.summary || '(제목 없음)',
        color: gcalColor(ev.colorId),
        dateStr: startDate,
        endDateStr: endDate,
        startTime,
        isGcal: true as const,
      };
    });
  }, []);

  // Fetch GCal events for current view month
  const loadGCalEvents = useCallback(async (token: string, year: number, month: number) => {
    setGcalLoading(true);
    setGcalError(null);
    try {
      const timeMin = new Date(year, month, 1);
      const timeMax = new Date(year, month + 1, 0, 23, 59, 59);
      const raw = await fetchGCalEvents(token, timeMin, timeMax);
      setGcalDisplayEvents(normalizeGCalEvents(raw));
    } catch (err) {
      if (err instanceof Error && err.message === 'token_expired') {
        disconnectGoogleCalendar();
        setGcalToken(null);
        setGcalDisplayEvents([]);
        setGcalError('token_expired');
      } else {
        setGcalError('fetch_failed');
      }
    } finally {
      setGcalLoading(false);
    }
  }, [normalizeGCalEvents]);

  // Check for stored GCal token or pending redirect result on mount
  useEffect(() => {
    const stored = getStoredGCalToken();
    if (stored) { setGcalToken(stored); return; }
    // Check if returning from mobile signInWithRedirect
    checkGCalRedirectResult().then(token => {
      if (token) setGcalToken(token);
    });
  }, []);

  // Reload GCal events when month changes or token set
  useEffect(() => {
    if (!gcalToken) return;
    loadGCalEvents(gcalToken, viewYear, viewMonth);
  }, [gcalToken, viewYear, viewMonth, loadGCalEvents]);

  const handleConnectGCal = async () => {
    setGcalLoading(true);
    setGcalError(null);
    try {
      const isTauri = typeof window !== 'undefined' &&
        ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);

      let token: string;
      if (isTauri) {
        // Detect desktop vs mobile
        let isMobile = false;
        try {
          const { type } = await import('@tauri-apps/plugin-os');
          const os = type();
          isMobile = os === 'android' || os === 'ios';
        } catch { /* plugin not available, assume desktop */ }

        if (isMobile) {
          // Mobile: signInWithRedirect — page will reload after auth
          await connectGoogleCalendarRedirect();
          setGcalLoading(false);
          return;
        } else {
          // Desktop: system browser + local OAuth server
          token = await connectGoogleCalendarDesktop({
            apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
            authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
          });
        }
      } else {
        // Web: popup
        token = await connectGoogleCalendar();
      }
      setGcalToken(token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setGcalError(msg === 'timeout' ? 'timeout' : 'connect_failed');
      setGcalLoading(false);
    }
  };

  const handleDisconnectGCal = () => {
    disconnectGoogleCalendar();
    setGcalToken(null);
    setGcalDisplayEvents([]);
    setGcalError(null);
  };

  // Load events
  useEffect(() => {
    if (!user) return;
    if (initialLoad.current) {
      setLoading(true);
      getCalendarEvents(user.uid).then(items => {
        setEvents(items);
        setLoading(false);
        initialLoad.current = false;
      });
    }
  }, [user]);

  // Task due dates → virtual calendar entries
  const taskDueEvents: { date: string; title: string; color: string; isTask: true; taskId: string }[] = tasks
    .filter(t => t.dueDate && t.myDay && t.status !== 'completed')
    .map(t => ({
      date: t.dueDate!,
      title: `📋 ${t.title}`,
      color: '#f59e0b',
      isTask: true as const,
      taskId: t.id!,
    }));

  // Navigation
  const goToday = () => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); };
  const prevMonth = () => { if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); } else setViewMonth(m => m - 1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); } else setViewMonth(m => m + 1); };

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(dateLocale, { year: 'numeric', month: 'long' });
  const todayDateStr = todayStr();

  // Build calendar grid
  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfWeek(viewYear, viewMonth);
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  const cells: { dateStr: string; day: number; isCurrentMonth: boolean }[] = [];
  for (let i = 0; i < totalCells; i++) {
    const d = new Date(viewYear, viewMonth, i - firstDay + 1);
    cells.push({ dateStr: toDateStr(d), day: d.getDate(), isCurrentMonth: d.getMonth() === viewMonth });
  }

  // Get events for a date (including multi-day spans)
  const getEventsForDate = (dateStr: string) => {
    const calEvents = events.filter(e => {
      if (e.date === dateStr) return true;
      if (e.endDate && e.date <= dateStr && e.endDate >= dateStr) return true;
      return false;
    });
    const taskEvents = taskDueEvents.filter(e => e.date === dateStr);
    const gcalEvents = gcalDisplayEvents.filter(e =>
      e.dateStr <= dateStr && e.endDateStr >= dateStr
    );
    return [
      ...calEvents.map(e => ({ ...e, isTask: false as const, isGcal: false as const })),
      ...taskEvents.map(e => ({ ...e, isGcal: false as const })),
      ...gcalEvents,
    ];
  };

  // Weekday headers
  const weekdays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2024, 0, i); // Jan 2024 starts on Monday — wait, let me use Sunday-based
    const d2 = new Date(2024, 0, i + 0); // Jan 0 = Dec 31 Sun, Jan 1 = Mon... We need Sun-Sat
    // Actually: new Date(2024, 0, 7+i) where 7 is the next Sunday
    const dayDate = new Date(2024, 6, 7 + i); // July 7 2024 is a Sunday
    return dayDate.toLocaleDateString(dateLocale, { weekday: 'short' });
  });

  // CRUD handlers
  const handleSaveEvent = useCallback(async (data: Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!user) return;
    if (editingEvent?.id) {
      await updateCalendarEvent(user.uid, editingEvent.id, data);
      setEvents(prev => prev.map(e => e.id === editingEvent.id ? { ...e, ...data } : e));
    } else {
      const id = await addCalendarEvent(user.uid, data);
      setEvents(prev => [...prev, { ...data, id }]);
    }
    setShowModal(false);
    setEditingEvent(null);
  }, [user, editingEvent]);

  const handleDeleteEvent = useCallback(async () => {
    if (!user || !editingEvent?.id) return;
    await deleteCalendarEvent(user.uid, editingEvent.id);
    setEvents(prev => prev.filter(e => e.id !== editingEvent.id));
    setShowModal(false);
    setEditingEvent(null);
  }, [user, editingEvent]);

  const handleDateClick = (dateStr: string) => {
    setSelectedDate(dateStr === selectedDate ? null : dateStr);
  };

  const handleDateDblClick = (dateStr: string) => {
    setSelectedDate(dateStr);
    setEditingEvent(null);
    setShowModal(true);
  };

  const handleEventClick = (event: CalendarEvent) => {
    setEditingEvent(event);
    setShowModal(true);
  };

  // Selected date events
  const selectedDateEvents = selectedDate ? getEventsForDate(selectedDate) : [];

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <div className="w-6 h-6 border-2 border-[#e94560] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📅</span>
            <h2 className="text-2xl font-extrabold text-text-primary">{t('calendar.title')}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setSelectedDate(todayDateStr); setEditingEvent(null); setShowModal(true); }}
              className="px-4 py-2 bg-[#e94560] text-white rounded-xl text-sm font-bold hover:bg-[#d63b55] transition-colors flex items-center gap-1.5"
            >
              <span className="text-base">+</span>
              {t('calendar.newEvent')}
            </button>
          </div>
        </div>

        {/* Month Navigation */}
        <div className="mb-4 flex items-center justify-between bg-background-card border border-border rounded-xl px-4 py-3">
          <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-border/50 transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-bold text-text-primary">{monthLabel}</h3>
            {(viewYear !== today.getFullYear() || viewMonth !== today.getMonth()) && (
              <button onClick={goToday} className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-[#e94560]/15 text-[#e94560] hover:bg-[#e94560]/25 transition-colors">
                {t('calendar.today')}
              </button>
            )}
          </div>
          <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-border/50 transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>

        {/* Calendar Grid */}
        <div className="bg-background-card border border-border rounded-2xl overflow-hidden">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b border-border">
            {weekdays.map((wd, i) => (
              <div key={i} className={`py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-text-muted'}`}>
                {wd}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7">
            {cells.map((cell, i) => {
              const dayEvents = getEventsForDate(cell.dateStr);
              const isToday = cell.dateStr === todayDateStr;
              const isSelected = cell.dateStr === selectedDate;
              const isSun = i % 7 === 0;
              const isSat = i % 7 === 6;
              return (
                <div
                  key={i}
                  onClick={() => handleDateClick(cell.dateStr)}
                  onDoubleClick={() => handleDateDblClick(cell.dateStr)}
                  className={`min-h-[100px] border-b border-r border-border p-1.5 cursor-pointer transition-colors ${
                    !cell.isCurrentMonth ? 'opacity-30' :
                    isSelected ? 'bg-[#e94560]/5' :
                    'hover:bg-background-hover'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold transition-all ${
                      isToday ? 'bg-[#e94560] text-white' :
                      isSun ? 'text-red-400' :
                      isSat ? 'text-blue-400' :
                      'text-text-primary'
                    }`}>
                      {cell.day}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 3).map((ev, j) => (
                      <button
                        key={j}
                        onClick={e => {
                          e.stopPropagation();
                          if ('isGcal' in ev && ev.isGcal) return;
                          if (!ev.isTask && 'id' in ev) handleEventClick(ev as CalendarEvent);
                        }}
                        className="w-full text-left px-1.5 py-0.5 rounded text-[10px] font-medium truncate transition-colors hover:brightness-110"
                        style={{ backgroundColor: `${ev.color}20`, color: ev.color }}
                      >
                        {'isGcal' in ev && ev.isGcal ? (
                          <>
                            <span className="opacity-50 mr-0.5 font-bold">G</span>
                            {ev.startTime && <span className="opacity-70 mr-1">{ev.startTime}</span>}
                            {ev.title}
                          </>
                        ) : (
                          <>
                            {!ev.isTask && !(ev as CalendarEvent).allDay && (ev as CalendarEvent).startTime && (
                              <span className="opacity-70 mr-1">{(ev as CalendarEvent).startTime}</span>
                            )}
                            {ev.title}
                          </>
                        )}
                      </button>
                    ))}
                    {dayEvents.length > 3 && (
                      <span className="text-[9px] text-text-muted px-1.5">+{dayEvents.length - 3}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected date detail panel */}
        {selectedDate && (
          <div className="mt-4 bg-background-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-text-primary">
                {new Date(selectedDate + 'T00:00:00').toLocaleDateString(dateLocale, { month: 'long', day: 'numeric', weekday: 'long' })}
              </h4>
              <button
                onClick={() => { setEditingEvent(null); setShowModal(true); }}
                className="px-3 py-1.5 text-xs font-semibold text-[#e94560] hover:bg-[#e94560]/10 rounded-lg transition-colors"
              >
                + {t('calendar.newEvent')}
              </button>
            </div>
            {selectedDateEvents.length === 0 ? (
              <p className="text-sm text-text-muted py-4 text-center">{t('calendar.noEvents')}</p>
            ) : (
              <div className="space-y-2">
                {selectedDateEvents.map((ev, i) => {
                  const isGcal = 'isGcal' in ev && ev.isGcal;
                  const isTask = !isGcal && ev.isTask;
                  return (
                  <div
                    key={i}
                    onClick={() => {
                      if (isGcal || isTask) return;
                      if ('id' in ev) handleEventClick(ev as CalendarEvent);
                    }}
                    className={`flex items-center gap-3 p-3 rounded-xl border border-border transition-all ${(!isGcal && !isTask) ? 'cursor-pointer hover:border-border-hover' : ''}`}
                  >
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: ev.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-text-primary truncate">{ev.title}</p>
                      {isGcal && (ev as GCalDisplayEvent).startTime && (
                        <p className="text-[11px] text-text-muted">{(ev as GCalDisplayEvent).startTime}</p>
                      )}
                      {!isGcal && !isTask && !(ev as CalendarEvent).allDay && (
                        <p className="text-[11px] text-text-muted">
                          {(ev as CalendarEvent).startTime} - {(ev as CalendarEvent).endTime}
                        </p>
                      )}
                      {isTask && (
                        <p className="text-[10px] text-amber-400 font-semibold">{t('calendar.taskDue')}</p>
                      )}
                    </div>
                    {isGcal && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#4285F4]/10 text-[#4285F4] font-semibold">Google</span>
                    )}
                    {!isGcal && !isTask && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: `${ev.color}15`, color: ev.color }}>
                        {(ev as CalendarEvent).allDay ? t('calendar.allDay') : (ev as CalendarEvent).startTime}
                      </span>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Google Calendar Connect */}
        <div className="mt-6 p-4 bg-background-card border border-border rounded-xl">
          <div className="flex items-center gap-3">
            <img src="/googlecalendar.png" alt="Google Calendar" className="w-10 h-10 rounded-xl flex-shrink-0 object-contain" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-text-primary">{t('calendar.googleConnect')}</p>
              {gcalToken ? (
                <p className="text-[11px] text-green-400 font-semibold">
                  {gcalLoading ? '불러오는 중...' : `${gcalDisplayEvents.length}개 일정 동기화됨`}
                </p>
              ) : (
                <p className="text-[11px] text-text-muted">Google 캘린더 일정을 이 화면에서 함께 봅니다</p>
              )}
              {gcalError && gcalError !== 'token_expired' && (
                <p className="text-[10px] text-red-400 mt-0.5">
                  {gcalError === 'fetch_failed'
                    ? '일정을 불러오지 못했습니다.'
                    : gcalError === 'timeout'
                    ? '연결 시간이 초과됐습니다. 다시 시도해주세요.'
                    : '연결에 실패했습니다. 다시 시도해주세요.'}
                </p>
              )}
              {gcalError === 'token_expired' && (
                <p className="text-[10px] text-amber-400 mt-0.5">세션이 만료됐습니다. 다시 연결해주세요.</p>
              )}
            </div>
            {gcalToken ? (
              <div className="flex items-center gap-2 flex-shrink-0">
                {gcalLoading && (
                  <div className="w-4 h-4 border-2 border-[#4285F4] border-t-transparent rounded-full animate-spin" />
                )}
                <button
                  onClick={handleDisconnectGCal}
                  className="px-3 py-1.5 text-xs text-text-muted hover:text-red-400 border border-border hover:border-red-400/50 rounded-xl transition-colors"
                >
                  연결 해제
                </button>
              </div>
            ) : (
              <button
                onClick={handleConnectGCal}
                disabled={gcalLoading}
                className="px-4 py-2 bg-[#4285F4] text-white rounded-xl text-xs font-bold hover:bg-[#3367d6] disabled:opacity-50 transition-colors flex-shrink-0 flex items-center gap-1.5"
              >
                {gcalLoading ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : null}
                {t('calendar.googleConnect')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Event Modal */}
      {showModal && (
        <EventModal
          event={editingEvent}
          defaultDate={selectedDate || todayDateStr}
          onSave={handleSaveEvent}
          onDelete={editingEvent?.id ? handleDeleteEvent : undefined}
          onClose={() => { setShowModal(false); setEditingEvent(null); }}
          t={t}
        />
      )}
    </div>
  );
}
