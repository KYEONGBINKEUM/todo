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
  onSave: (data: Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onDelete?: () => void;
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

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      date,
      endDate: endDate > date ? endDate : undefined,
      allDay,
      startTime: allDay ? undefined : startTime,
      endTime: allDay ? undefined : endTime,
      color,
      memo: memo.trim() || undefined,
    });
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
          onKeyDown={e => e.key === 'Enter' && handleSave()}
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

        <div className="flex items-center justify-between pt-2">
          {event && onDelete ? (
            <button onClick={onDelete} className="text-xs text-red-400 hover:text-red-300 transition-colors">
              {t('calendar.deleteEvent')}
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors">
              {t('common.cancel')}
            </button>
            <button onClick={handleSave} disabled={!title.trim()}
              className="px-5 py-2 bg-[#e94560] text-white rounded-xl text-sm font-bold hover:bg-[#d63b55] disabled:opacity-40 transition-all">
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
    return [...calEvents.map(e => ({ ...e, isTask: false as const })), ...taskEvents];
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
                        onClick={e => { e.stopPropagation(); if (!ev.isTask && 'id' in ev) handleEventClick(ev as CalendarEvent); }}
                        className="w-full text-left px-1.5 py-0.5 rounded text-[10px] font-medium truncate transition-colors hover:brightness-110"
                        style={{ backgroundColor: `${ev.color}20`, color: ev.color }}
                      >
                        {!ev.isTask && !(ev as CalendarEvent).allDay && (ev as CalendarEvent).startTime && (
                          <span className="opacity-70 mr-1">{(ev as CalendarEvent).startTime}</span>
                        )}
                        {ev.title}
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
                {selectedDateEvents.map((ev, i) => (
                  <div
                    key={i}
                    onClick={() => { if (!ev.isTask && 'id' in ev) handleEventClick(ev as CalendarEvent); }}
                    className={`flex items-center gap-3 p-3 rounded-xl border border-border transition-all ${ev.isTask ? '' : 'cursor-pointer hover:border-border-hover'}`}
                  >
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: ev.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-text-primary truncate">{ev.title}</p>
                      {!ev.isTask && !(ev as CalendarEvent).allDay && (
                        <p className="text-[11px] text-text-muted">
                          {(ev as CalendarEvent).startTime} - {(ev as CalendarEvent).endTime}
                        </p>
                      )}
                      {ev.isTask && (
                        <p className="text-[10px] text-amber-400 font-semibold">{t('calendar.taskDue')}</p>
                      )}
                    </div>
                    {!ev.isTask && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: `${ev.color}15`, color: ev.color }}>
                        {(ev as CalendarEvent).allDay ? t('calendar.allDay') : (ev as CalendarEvent).startTime}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Google Calendar — info placeholder */}
        <div className="mt-6 p-4 bg-background-card border border-border rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-green-500 flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
              G
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-text-primary">{t('calendar.googleConnect')}</p>
              <p className="text-[11px] text-text-muted">Google Calendar API integration — Coming soon</p>
            </div>
            <button
              disabled
              className="px-4 py-2 bg-border/60 text-text-muted rounded-xl text-xs font-semibold cursor-not-allowed"
            >
              {t('calendar.googleConnect')}
            </button>
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
