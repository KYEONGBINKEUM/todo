'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n-context';
import { useDataStore } from '@/lib/data-store';
import {
  addCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  type CalendarEvent,
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
import {
  getCalSettings,
  saveCalSettings,
  fetchAllHolidays,
  HOLIDAY_COUNTRIES,
  requestNotificationPermission,
  shouldShowNotification,
  markNotificationShown,
  type CalSettings,
  type HolidayEntry,
} from '@/lib/cal-settings';

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
function getDaysInMonth(year: number, month: number) { return new Date(year, month + 1, 0).getDate(); }
function getFirstDayOfWeek(year: number, month: number) { return new Date(year, month, 1).getDay(); }

const EVENT_COLORS = ['#e94560', '#8b5cf6', '#06b6d4', '#22c55e', '#f59e0b', '#ec4899', '#6366f1', '#14b8a6'];

// ── Event Form Modal ─────────────────────────────────────────────────────────

function EventModal({
  event, defaultDate, onSave, onDelete, onClose, t,
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
    setSaving(true); setSaveError(null);
    try {
      await onSave({
        title: title.trim(), date,
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
        <input value={title} onChange={e => setTitle(e.target.value)}
          placeholder={t('calendar.eventTitle')} autoFocus
          className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-text-primary outline-none focus:border-[#e94560] transition-colors"
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); }} />
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
          <input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)} className="w-4 h-4 rounded accent-[#e94560]" />
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
        <textarea value={memo} onChange={e => setMemo(e.target.value)} placeholder="Memo..." rows={2}
          className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm text-text-primary outline-none focus:border-[#e94560] resize-none" />
        {saveError && <p className="text-xs text-red-400 text-center">{saveError}</p>}
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

// ── Settings Modal ────────────────────────────────────────────────────────────

function CalendarSettingsModal({
  settings,
  onSave,
  onClose,
}: {
  settings: CalSettings;
  onSave: (s: CalSettings) => void;
  onClose: () => void;
}) {
  const [local, setLocal] = useState<CalSettings>({ ...settings });
  const [notifSupported, setNotifSupported] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');

  useEffect(() => {
    setNotifSupported(typeof Notification !== 'undefined');
  }, []);

  const toggleCountry = (code: string) => {
    setLocal(prev => ({
      ...prev,
      holidayCountries: prev.holidayCountries.includes(code)
        ? prev.holidayCountries.filter(c => c !== code)
        : [...prev.holidayCountries, code],
    }));
  };

  const handleSave = async () => {
    if (local.notifications && local.notifications !== settings.notifications) {
      await requestNotificationPermission();
    }
    onSave(local);
  };

  const filtered = HOLIDAY_COUNTRIES.filter(
    c => c.name.includes(countrySearch) || c.code.toLowerCase().includes(countrySearch.toLowerCase()),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-background-card border border-border rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-base font-bold text-text-primary">캘린더 설정</h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-border/50 transition-colors text-lg">×</button>
        </div>

        <div className="overflow-y-auto max-h-[75vh] px-5 py-4 space-y-5">

          {/* 1. Week start */}
          <div>
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">주 시작 요일</p>
            <div className="flex gap-2">
              {(['sun', 'mon'] as const).map(v => (
                <button key={v} onClick={() => setLocal(p => ({ ...p, weekStart: v }))}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all ${local.weekStart === v ? 'bg-[#e94560]/15 text-[#e94560] border-[#e94560]/40' : 'text-text-muted border-border hover:border-border-hover'}`}>
                  {v === 'sun' ? '일요일' : '월요일'}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Holidays */}
          <div>
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">공휴일 표시 국가</p>
            <input
              value={countrySearch}
              onChange={e => setCountrySearch(e.target.value)}
              placeholder="국가 검색..."
              className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm text-text-primary placeholder-text-muted outline-none focus:border-[#e94560] mb-2 transition-colors"
            />
            <div className="grid grid-cols-2 gap-1.5 max-h-[220px] overflow-y-auto pr-1">
              {filtered.map(c => {
                const on = local.holidayCountries.includes(c.code);
                return (
                  <button key={c.code} onClick={() => toggleCountry(c.code)}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs border transition-all text-left ${on ? 'bg-[#e94560]/10 text-[#e94560] border-[#e94560]/30 font-semibold' : 'text-text-secondary border-border hover:border-border-hover'}`}>
                    <span>{c.flag}</span>
                    <span className="truncate">{c.name}</span>
                    {on && <span className="ml-auto text-[10px]">✓</span>}
                  </button>
                );
              })}
            </div>
            {local.holidayCountries.length > 0 && (
              <button onClick={() => setLocal(p => ({ ...p, holidayCountries: [] }))}
                className="mt-2 text-xs text-text-muted hover:text-red-400 transition-colors">
                모두 해제
              </button>
            )}
          </div>

          {/* 3. Notifications */}
          <div>
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">알림</p>
            {notifSupported ? (
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <div>
                  <p className="text-sm text-text-primary font-medium">캘린더 알림 활성화</p>
                  <p className="text-xs text-text-muted">오늘·내일 일정을 앱 시작 시 알림</p>
                </div>
                <div onClick={() => setLocal(p => ({ ...p, notifications: !p.notifications }))}
                  className={`relative w-11 h-6 rounded-full cursor-pointer transition-colors flex-shrink-0 ${local.notifications ? 'bg-[#e94560]' : 'bg-border'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${local.notifications ? 'translate-x-5' : 'translate-x-0'}`} />
                </div>
              </label>
            ) : (
              <p className="text-xs text-text-muted">이 환경에서는 알림이 지원되지 않습니다.</p>
            )}
          </div>

          {/* 4. Show in other pages */}
          <div>
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">다른 페이지에 표시</p>
            <div className="space-y-3">
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <div>
                  <p className="text-sm text-text-primary font-medium">모든 작업 페이지</p>
                  <p className="text-xs text-text-muted">오늘 일정을 할일 페이지에 표시</p>
                </div>
                <div onClick={() => setLocal(p => ({ ...p, showInTasks: !p.showInTasks }))}
                  className={`relative w-11 h-6 rounded-full cursor-pointer transition-colors flex-shrink-0 ${local.showInTasks ? 'bg-[#e94560]' : 'bg-border'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${local.showInTasks ? 'translate-x-5' : 'translate-x-0'}`} />
                </div>
              </label>
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <div>
                  <p className="text-sm text-text-primary font-medium">예정된 작업 페이지</p>
                  <p className="text-xs text-text-muted">날짜별 일정을 예정된 작업에 표시</p>
                </div>
                <div onClick={() => setLocal(p => ({ ...p, showInUpcoming: !p.showInUpcoming }))}
                  className={`relative w-11 h-6 rounded-full cursor-pointer transition-colors flex-shrink-0 ${local.showInUpcoming ? 'bg-[#e94560]' : 'bg-border'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${local.showInUpcoming ? 'translate-x-5' : 'translate-x-0'}`} />
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 text-sm text-text-muted hover:text-text-primary border border-border rounded-xl transition-colors">
            취소
          </button>
          <button onClick={handleSave} className="flex-1 py-2 bg-[#e94560] text-white text-sm font-bold rounded-xl hover:bg-[#d63b55] transition-colors">
            저장
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Calendar Page ───────────────────────────────────────────────────────

export default function CalendarPage() {
  const { user } = useAuth();
  const { t, language } = useI18n();
  const { tasks, calendarEvents: storeEvents } = useDataStore();
  const dateLocale = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', es: 'es-ES', pt: 'pt-BR', fr: 'fr-FR' }[language] ?? 'en-US';

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Settings
  const [settings, setSettings] = useState<CalSettings>(() => getCalSettings());

  // Show tasks toggle (legacy separate key)
  const [showTasksInCalendar, setShowTasksInCalendar] = useState(() => {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem('cal_show_tasks');
    return saved === null ? true : saved === 'true';
  });

  // Holidays
  const [holidays, setHolidays] = useState<HolidayEntry[]>([]);

  // Google Calendar state
  const [gcalToken, setGcalToken] = useState<string | null>(null);
  const [gcalDisplayEvents, setGcalDisplayEvents] = useState<GCalDisplayEvent[]>([]);
  const [gcalLoading, setGcalLoading] = useState(false);
  const [gcalError, setGcalError] = useState<string | null>(null);

  // Fetch holidays when settings or view changes
  useEffect(() => {
    if (settings.holidayCountries.length === 0) { setHolidays([]); return; }
    const years = [viewYear - 1, viewYear, viewYear + 1];
    fetchAllHolidays(years, settings.holidayCountries).then(setHolidays);
  }, [settings.holidayCountries, viewYear]);

  // Notifications — 페이지 첫 로드 시 1회만 실행 (이벤트 추가/변경 시 재실행 방지)
  const notifFiredRef = useRef(false);
  useEffect(() => {
    if (!settings.notifications) return;
    if (notifFiredRef.current) return;
    if (!shouldShowNotification()) { notifFiredRef.current = true; return; }
    if (storeEvents.length === 0) return; // 아직 로드 전이면 대기
    notifFiredRef.current = true;
    const todayDate = todayStr();
    const tomorrowDate = toDateStr(new Date(Date.now() + 86400000));
    const upcoming = storeEvents.filter(e => e.date === todayDate || e.date === tomorrowDate);
    if (upcoming.length === 0) return;
    markNotificationShown();
    const label = upcoming.some(e => e.date === todayDate) ? '오늘 일정' : '내일 일정';
    try {
      new Notification(label, {
        body: upcoming.slice(0, 3).map(e => e.title).join(', '),
        icon: '/icon-192.png',
      });
    } catch { /* ignore */ }
  }, [settings.notifications, storeEvents]);

  // GCal helpers
  const normalizeGCalEvents = useCallback((raw: GCalEvent[]): GCalDisplayEvent[] => {
    return raw.map(ev => {
      const startDate = ev.start.date ?? ev.start.dateTime?.slice(0, 10) ?? '';
      let endDate = ev.end.date ?? ev.end.dateTime?.slice(0, 10) ?? startDate;
      if (ev.end.date) {
        const d = new Date(ev.end.date + 'T00:00:00');
        d.setDate(d.getDate() - 1);
        endDate = toDateStr(d);
      }
      return {
        id: ev.id,
        title: ev.summary || '(제목 없음)',
        color: gcalColor(ev.colorId),
        dateStr: startDate,
        endDateStr: endDate,
        startTime: ev.start.dateTime ? ev.start.dateTime.slice(11, 16) : undefined,
        isGcal: true as const,
      };
    });
  }, []);

  const loadGCalEvents = useCallback(async (token: string, year: number, month: number) => {
    setGcalLoading(true); setGcalError(null);
    try {
      const raw = await fetchGCalEvents(token, new Date(year, month, 1), new Date(year, month + 1, 0, 23, 59, 59));
      setGcalDisplayEvents(normalizeGCalEvents(raw));
    } catch (err) {
      if (err instanceof Error && err.message === 'token_expired') {
        disconnectGoogleCalendar(); setGcalToken(null); setGcalDisplayEvents([]); setGcalError('token_expired');
      } else { setGcalError('fetch_failed'); }
    } finally { setGcalLoading(false); }
  }, [normalizeGCalEvents]);

  useEffect(() => {
    const stored = getStoredGCalToken();
    if (stored) { setGcalToken(stored); return; }
    checkGCalRedirectResult().then(token => { if (token) setGcalToken(token); });
  }, []);

  useEffect(() => {
    if (!gcalToken) return;
    loadGCalEvents(gcalToken, viewYear, viewMonth);
  }, [gcalToken, viewYear, viewMonth, loadGCalEvents]);

  const handleConnectGCal = async () => {
    setGcalLoading(true); setGcalError(null);
    try {
      const isTauri = typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);
      let token: string;
      if (isTauri) {
        let isMobile = false;
        try { const { type } = await import('@tauri-apps/plugin-os'); isMobile = type() === 'android' || type() === 'ios'; } catch { }
        if (isMobile) { await connectGoogleCalendarRedirect(); setGcalLoading(false); return; }
        token = await connectGoogleCalendarDesktop({
          apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
          authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
        });
      } else {
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
    disconnectGoogleCalendar(); setGcalToken(null); setGcalDisplayEvents([]); setGcalError(null);
  };

  const handleSaveSettings = (s: CalSettings) => {
    saveCalSettings(s);
    setSettings(s);
    setShowSettingsModal(false);
  };

  const toggleShowTasks = () => {
    setShowTasksInCalendar(v => {
      localStorage.setItem('cal_show_tasks', String(!v));
      return !v;
    });
  };

  // ── Week start logic ────────────────────────────────────────────────────────
  const weekStartDay = settings.weekStart === 'mon' ? 1 : 0; // 0=Sun, 1=Mon

  // Calendar grid
  const todayDateStr = todayStr();
  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  let rawFirstDay = getFirstDayOfWeek(viewYear, viewMonth); // 0=Sun
  if (weekStartDay === 1) rawFirstDay = (rawFirstDay - 1 + 7) % 7; // shift for Mon-start
  const totalCells = Math.ceil((rawFirstDay + daysInMonth) / 7) * 7;
  const cells: { dateStr: string; day: number; isCurrentMonth: boolean }[] = [];
  for (let i = 0; i < totalCells; i++) {
    const d = new Date(viewYear, viewMonth, i - rawFirstDay + 1);
    cells.push({ dateStr: toDateStr(d), day: d.getDate(), isCurrentMonth: d.getMonth() === viewMonth });
  }

  // Weekday headers
  const weekdays = Array.from({ length: 7 }, (_, i) => {
    const dayIndex = (weekStartDay + i) % 7;
    const d = new Date(2024, 6, 7 + dayIndex); // July 7, 2024 = Sunday
    return d.toLocaleDateString(dateLocale, { weekday: 'short' });
  });

  // Column coloring: Sun=red, Sat=blue
  const sunCol = weekStartDay === 0 ? 0 : 6;
  const satCol = weekStartDay === 0 ? 6 : 5;

  // Navigation
  const goToday = () => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); };
  const prevMonth = () => { if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); } else setViewMonth(m => m - 1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); } else setViewMonth(m => m + 1); };

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(dateLocale, { year: 'numeric', month: 'long' });

  // Task virtual events
  const _todayStr = todayDateStr;
  const taskDueEvents = showTasksInCalendar
    ? tasks.filter(t => t.status !== 'completed' && (t.dueDate || t.myDay))
        .map(t => ({ date: t.dueDate || _todayStr, title: `📋 ${t.title}`, color: '#f59e0b', isTask: true as const, taskId: t.id! }))
    : [];

  // Holiday map
  const holidayMap = new Map<string, HolidayEntry[]>();
  for (const h of holidays) {
    const existing = holidayMap.get(h.date) ?? [];
    holidayMap.set(h.date, [...existing, h]);
  }

  // Events for a date
  const getEventsForDate = (dateStr: string) => {
    const calEvents = storeEvents.filter(e =>
      e.date === dateStr || (e.endDate && e.date <= dateStr && e.endDate >= dateStr)
    );
    const taskEvents = taskDueEvents.filter(e => e.date === dateStr);
    const gcalEvents = gcalDisplayEvents.filter(e => e.dateStr <= dateStr && e.endDateStr >= dateStr);
    return [
      ...calEvents.map(e => ({ ...e, isTask: false as const, isGcal: false as const })),
      ...taskEvents.map(e => ({ ...e, isGcal: false as const })),
      ...gcalEvents,
    ];
  };

  // CRUD
  const handleSaveEvent = useCallback(async (data: Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!user) return;
    if (editingEvent?.id) {
      await updateCalendarEvent(user.uid, editingEvent.id, data);
    } else {
      await addCalendarEvent(user.uid, data);
    }
    setShowModal(false); setEditingEvent(null);
  }, [user, editingEvent]);

  const handleDeleteEvent = useCallback(async () => {
    if (!user || !editingEvent?.id) return;
    await deleteCalendarEvent(user.uid, editingEvent.id);
    setShowModal(false); setEditingEvent(null);
  }, [user, editingEvent]);

  const selectedDateEvents = selectedDate ? getEventsForDate(selectedDate) : [];

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📅</span>
            <h2 className="text-2xl font-bold text-text-primary">{t('calendar.title')}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleShowTasks} title={showTasksInCalendar ? '할일 숨기기' : '할일 표시'}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${showTasksInCalendar ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20' : 'text-text-muted border-border hover:text-text-primary'}`}>
              <span>📋</span>
              {showTasksInCalendar ? '할일 표시 중' : '할일 숨김'}
            </button>
            {/* Settings button */}
            <button onClick={() => setShowSettingsModal(true)} title="캘린더 설정"
              className="w-9 h-9 flex items-center justify-center rounded-xl text-text-muted hover:text-text-primary border border-border hover:border-border-hover transition-all">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
            <button onClick={() => { setSelectedDate(todayDateStr); setEditingEvent(null); setShowModal(true); }}
              className="px-4 py-2 bg-[#e94560] text-white rounded-xl text-sm font-bold hover:bg-[#d63b55] transition-colors flex items-center gap-1.5">
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
              <div key={i} className={`py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider ${i === sunCol ? 'text-red-400' : i === satCol ? 'text-blue-400' : 'text-text-muted'}`}>
                {wd}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7">
            {cells.map((cell, i) => {
              const dayEvents = getEventsForDate(cell.dateStr);
              const dayHolidays = holidayMap.get(cell.dateStr) ?? [];
              const isToday = cell.dateStr === todayDateStr;
              const isSelected = cell.dateStr === selectedDate;
              const isSun = i % 7 === sunCol;
              const isSat = i % 7 === satCol;
              return (
                <div key={i}
                  onClick={() => setSelectedDate(cell.dateStr === selectedDate ? null : cell.dateStr)}
                  onDoubleClick={() => { setSelectedDate(cell.dateStr); setEditingEvent(null); setShowModal(true); }}
                  className={`min-h-[100px] border-b border-r border-border p-1.5 cursor-pointer transition-colors ${!cell.isCurrentMonth ? 'opacity-30' : isSelected ? 'bg-[#e94560]/5' : 'hover:bg-background-hover'}`}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold transition-all ${isToday ? 'bg-[#e94560] text-white' : (isSun || dayHolidays.length > 0) ? 'text-red-400' : isSat ? 'text-blue-400' : 'text-text-primary'}`}>
                      {cell.day}
                    </span>
                    {dayHolidays.length > 0 && (
                      <span className="text-[9px] text-red-400 truncate max-w-[3.5rem] leading-tight text-right" title={dayHolidays.map(h => h.name).join(', ')}>
                        {dayHolidays[0].name}
                      </span>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 3).map((ev, j) => (
                      <button key={j}
                        onClick={e => {
                          e.stopPropagation();
                          if ('isGcal' in ev && ev.isGcal) return;
                          if (!ev.isTask && 'id' in ev) { setEditingEvent(ev as CalendarEvent); setShowModal(true); }
                        }}
                        className="w-full text-left px-1.5 py-0.5 rounded text-[10px] font-medium truncate transition-colors hover:brightness-110"
                        style={{ backgroundColor: `${ev.color}20`, color: ev.color }}
                      >
                        {'isGcal' in ev && ev.isGcal ? (
                          <><span className="opacity-50 mr-0.5 font-bold">G</span>{(ev as GCalDisplayEvent).startTime && <span className="opacity-70 mr-1">{(ev as GCalDisplayEvent).startTime}</span>}{ev.title}</>
                        ) : (
                          <>{!ev.isTask && !(ev as CalendarEvent).allDay && (ev as CalendarEvent).startTime && <span className="opacity-70 mr-1">{(ev as CalendarEvent).startTime}</span>}{ev.title}</>
                        )}
                      </button>
                    ))}
                    {dayEvents.length > 3 && <span className="text-[9px] text-text-muted px-1.5">+{dayEvents.length - 3}</span>}
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
              <div>
                <h4 className="text-sm font-bold text-text-primary">
                  {new Date(selectedDate + 'T00:00:00').toLocaleDateString(dateLocale, { month: 'long', day: 'numeric', weekday: 'long' })}
                </h4>
                {(holidayMap.get(selectedDate) ?? []).map(h => (
                  <span key={h.countryCode + h.date} className="text-xs text-red-400 font-semibold">
                    🎌 {h.name}
                  </span>
                ))}
              </div>
              <button onClick={() => { setEditingEvent(null); setShowModal(true); }}
                className="px-3 py-1.5 text-xs font-semibold text-[#e94560] hover:bg-[#e94560]/10 rounded-lg transition-colors">
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
                    <div key={i}
                      onClick={() => { if (isGcal || isTask) return; if ('id' in ev) { setEditingEvent(ev as CalendarEvent); setShowModal(true); } }}
                      className={`flex items-center gap-3 p-3 rounded-xl border border-border transition-all ${(!isGcal && !isTask) ? 'cursor-pointer hover:border-border-hover' : ''}`}
                    >
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: ev.color }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-text-primary truncate">{ev.title}</p>
                        {isGcal && (ev as GCalDisplayEvent).startTime && (
                          <p className="text-[11px] text-text-muted">{(ev as GCalDisplayEvent).startTime}</p>
                        )}
                        {!isGcal && !isTask && !(ev as CalendarEvent).allDay && (
                          <p className="text-[11px] text-text-muted">{(ev as CalendarEvent).startTime} - {(ev as CalendarEvent).endTime}</p>
                        )}
                        {isTask && <p className="text-[10px] text-amber-400 font-semibold">{t('calendar.taskDue')}</p>}
                      </div>
                      {isGcal && <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#4285F4]/10 text-[#4285F4] font-semibold">Google</span>}
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
                  {gcalError === 'fetch_failed' ? '일정을 불러오지 못했습니다.' : gcalError === 'timeout' ? '연결 시간이 초과됐습니다. 다시 시도해주세요.' : '연결에 실패했습니다. 다시 시도해주세요.'}
                </p>
              )}
              {gcalError === 'token_expired' && <p className="text-[10px] text-amber-400 mt-0.5">세션이 만료됐습니다. 다시 연결해주세요.</p>}
            </div>
            {gcalToken ? (
              <div className="flex items-center gap-2 flex-shrink-0">
                {gcalLoading && <div className="w-4 h-4 border-2 border-[#4285F4] border-t-transparent rounded-full animate-spin" />}
                <button onClick={handleDisconnectGCal} className="px-3 py-1.5 text-xs text-text-muted hover:text-red-400 border border-border hover:border-red-400/50 rounded-xl transition-colors">
                  연결 해제
                </button>
              </div>
            ) : (
              <button onClick={handleConnectGCal} disabled={gcalLoading}
                className="px-4 py-2 bg-[#4285F4] text-white rounded-xl text-xs font-bold hover:bg-[#3367d6] disabled:opacity-50 transition-colors flex-shrink-0 flex items-center gap-1.5">
                {gcalLoading && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
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

      {/* Settings Modal */}
      {showSettingsModal && (
        <CalendarSettingsModal
          settings={settings}
          onSave={handleSaveSettings}
          onClose={() => setShowSettingsModal(false)}
        />
      )}
    </div>
  );
}
