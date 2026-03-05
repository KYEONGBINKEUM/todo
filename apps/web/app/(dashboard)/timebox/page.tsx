'use client';

import { useState } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { useDataStore } from '@/lib/data-store';
import TimeboxPlanner from '@/components/timebox/TimeboxPlanner';

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toLocalDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function TimeboxPage() {
  const { t } = useI18n();
  const { tasks: storeTasks } = useDataStore();
  const todayStr = getTodayStr();
  const [selectedDate, setSelectedDate] = useState(todayStr);

  const shiftDate = (days: number) => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + days);
    setSelectedDate(toLocalDateStr(d));
  };

  const myDayTasks = storeTasks.filter((t) => t.myDay);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">{t('nav.timebox')}</h1>
            <p className="text-sm text-text-muted mt-0.5">
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
            </p>
          </div>
          {/* Date navigation */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => shiftDate(-1)}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-border hover:bg-background-card transition-colors text-text-secondary"
            >
              ‹
            </button>
            <button
              onClick={() => setSelectedDate(todayStr)}
              className={`px-3 h-8 rounded-lg text-xs font-semibold transition-colors border ${
                selectedDate === todayStr
                  ? 'bg-[#e94560]/10 text-[#e94560] border-[#e94560]/30'
                  : 'border-border text-text-secondary hover:bg-background-card'
              }`}
            >
              오늘
            </button>
            <button
              onClick={() => shiftDate(1)}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-border hover:bg-background-card transition-colors text-text-secondary"
            >
              ›
            </button>
          </div>
        </div>

        <TimeboxPlanner date={selectedDate} tasks={myDayTasks} />
      </div>
    </div>
  );
}
