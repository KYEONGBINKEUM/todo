'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n-context';
import { useDataStore } from '@/lib/data-store';
import { getUserSettings } from '@/lib/firestore';
import TimeboxPlanner from '@/components/timebox/TimeboxPlanner';

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toLocalDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function generateCalendarDays(centerDateStr: string, locale: string = 'ko-KR') {
  const center = new Date(centerDateStr + 'T00:00:00');
  const todayStr = getTodayStr();
  const days = [];
  for (let i = -3; i <= 3; i++) {
    const d = new Date(center);
    d.setDate(center.getDate() + i);
    const ds = toLocalDateStr(d);
    const weekday = d.toLocaleDateString(locale, { weekday: 'short' });
    days.push({ dateStr: ds, day: d.getDate(), weekday, isToday: ds === todayStr });
  }
  return days;
}

export default function TimeboxPage() {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const { tasks: storeTasks } = useDataStore();
  const todayStr = getTodayStr();
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [hideFutureTasks, setHideFutureTasks] = useState(true);
  const datePickerRef = useRef<HTMLInputElement>(null);

  const dateLocale = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', es: 'es-ES', pt: 'pt-BR', fr: 'fr-FR' }[language] ?? 'en-US';
  const isViewingToday = selectedDate === todayStr;
  const calendarDays = generateCalendarDays(selectedDate, dateLocale);

  useEffect(() => {
    if (!user) return;
    getUserSettings(user.uid).then((s) => {
      setHideFutureTasks(s.hideFutureTasks ?? true);
    });
  }, [user]);

  const shiftCalendar = (days: number) => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + days);
    setSelectedDate(toLocalDateStr(d));
  };

  const myDayTasks = storeTasks.filter((t) => {
    if (!t.myDay) return false;
    if (hideFutureTasks) {
      const cd = t.createdDate ?? (t.createdAt && typeof t.createdAt.toDate === 'function'
        ? (() => { const d = t.createdAt.toDate(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })()
        : null);
      if (cd && cd > todayStr) return false;
    }
    return true;
  });

  const dateLabel = new Date(selectedDate + 'T00:00:00').toLocaleDateString(dateLocale, {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-5">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl">⏱️</span>
            <h2 className="text-2xl font-extrabold text-text-primary">{t('nav.timebox')}</h2>
            <div className="ml-auto flex items-center gap-2">
              {!isViewingToday && (
                <button
                  onClick={() => setSelectedDate(todayStr)}
                  className="px-3 py-1.5 text-[11px] font-bold bg-[#e94560]/15 text-[#e94560] rounded-lg hover:bg-[#e94560]/25 transition-colors"
                >
                  {t('timebox.today')}
                </button>
              )}
              <button
                onClick={() => datePickerRef.current?.showPicker()}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-[#e94560] hover:bg-border/50 transition-colors border border-border"
                title={t('timebox.datePicker')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              </button>
              <input
                ref={datePickerRef}
                type="date"
                value={selectedDate}
                onChange={(e) => { if (e.target.value) setSelectedDate(e.target.value); }}
                className="absolute w-0 h-0 opacity-0 pointer-events-none"
                tabIndex={-1}
              />
            </div>
          </div>
          <p className="text-sm text-text-muted ml-11">{dateLabel}</p>
        </div>

        {/* Calendar Strip */}
        <div className="mb-5 bg-background-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-1 px-2 py-2">
            <button
              onClick={() => shiftCalendar(-7)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-border/50 transition-colors flex-shrink-0"
              title={t('timebox.prev7Days')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>

            <div className="flex-1 grid grid-cols-7 gap-1">
              {calendarDays.map((d) => (
                <button
                  key={d.dateStr}
                  onClick={() => setSelectedDate(d.dateStr)}
                  className={`flex flex-col items-center py-2 rounded-xl transition-all ${
                    selectedDate === d.dateStr && d.isToday
                      ? 'bg-gradient-to-br from-[#e94560] to-[#533483] text-white shadow-lg shadow-[#e94560]/20'
                      : selectedDate === d.dateStr
                      ? 'bg-[#e94560]/15 text-[#e94560] border border-[#e94560]/30'
                      : d.isToday
                      ? 'text-[#e94560] font-bold hover:bg-[#e94560]/10'
                      : 'text-text-secondary hover:bg-background-hover'
                  }`}
                >
                  <span className="text-[10px] font-medium mb-0.5">{d.weekday}</span>
                  <span className={`text-lg font-bold ${selectedDate === d.dateStr && d.isToday ? 'text-white' : ''}`}>{d.day}</span>
                </button>
              ))}
            </div>

            <button
              onClick={() => shiftCalendar(7)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-border/50 transition-colors flex-shrink-0"
              title={t('timebox.next7Days')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          </div>
        </div>

        <TimeboxPlanner date={selectedDate} tasks={myDayTasks} />
      </div>
    </div>
  );
}
