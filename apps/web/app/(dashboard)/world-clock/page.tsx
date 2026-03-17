'use client';

import { useState, useEffect, useRef } from 'react';
import FloatingAIBar from '@/components/ai/FloatingAIBar';

type Tab = 'clocks' | 'meeting' | 'stopwatch' | 'datecalc';

// ── City Data ─────────────────────────────────────────────────────────────────
interface City {
  name: string;
  country: string;
  flag: string;
  tz: string;
}

const ALL_CITIES: City[] = [
  { name: '서울', country: '대한민국', flag: '🇰🇷', tz: 'Asia/Seoul' },
  { name: '뉴욕', country: '미국', flag: '🇺🇸', tz: 'America/New_York' },
  { name: '런던', country: '영국', flag: '🇬🇧', tz: 'Europe/London' },
  { name: '파리', country: '프랑스', flag: '🇫🇷', tz: 'Europe/Paris' },
  { name: '도쿄', country: '일본', flag: '🇯🇵', tz: 'Asia/Tokyo' },
  { name: '시드니', country: '호주', flag: '🇦🇺', tz: 'Australia/Sydney' },
  { name: '두바이', country: 'UAE', flag: '🇦🇪', tz: 'Asia/Dubai' },
  { name: '로스앤젤레스', country: '미국', flag: '🇺🇸', tz: 'America/Los_Angeles' },
  { name: '베이징', country: '중국', flag: '🇨🇳', tz: 'Asia/Shanghai' },
  { name: '싱가포르', country: '싱가포르', flag: '🇸🇬', tz: 'Asia/Singapore' },
  { name: '모스크바', country: '러시아', flag: '🇷🇺', tz: 'Europe/Moscow' },
  { name: '상파울루', country: '브라질', flag: '🇧🇷', tz: 'America/Sao_Paulo' },
  { name: '베를린', country: '독일', flag: '🇩🇪', tz: 'Europe/Berlin' },
  { name: '뭄바이', country: '인도', flag: '🇮🇳', tz: 'Asia/Kolkata' },
  { name: '토론토', country: '캐나다', flag: '🇨🇦', tz: 'America/Toronto' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function getTimeInTz(tz: string, date = new Date()): { time: string; date: string; offset: string; h: number; m: number; s: number } {
  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('ko-KR', { timeZone: tz, ...opts }).format(date);

  const h = parseInt(fmt({ hour: 'numeric', hour12: false }));
  const m = parseInt(fmt({ minute: 'numeric' }));
  const s = parseInt(fmt({ second: 'numeric' }));
  const time = fmt({ hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const dateStr = fmt({ year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });

  // Compute offset
  const utcMs = date.getTime();
  const localDate = new Date(date.toLocaleString('en-US', { timeZone: tz }));
  const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  const offsetMin = Math.round((localDate.getTime() - utcDate.getTime()) / 60000);
  const sign = offsetMin >= 0 ? '+' : '-';
  const absMin = Math.abs(offsetMin);
  const offset = `UTC${sign}${Math.floor(absMin / 60)}:${String(absMin % 60).padStart(2, '0')}`;

  return { time, date: dateStr, offset, h: h % 24, m, s };
}

// ── Analog Clock SVG ──────────────────────────────────────────────────────────
function AnalogClock({ h, m, s }: { h: number; m: number; s: number }) {
  const size = 80;
  const cx = size / 2, cy = size / 2, r = size / 2 - 3;
  const toRad = (deg: number) => (deg - 90) * (Math.PI / 180);
  const hand = (angle: number, length: number) => {
    const rad = toRad(angle);
    return { x: cx + length * Math.cos(rad), y: cy + length * Math.sin(rad) };
  };
  const hourAngle = (h % 12) * 30 + m * 0.5;
  const minAngle = m * 6 + s * 0.1;
  const secAngle = s * 6;
  const hourEnd = hand(hourAngle, r * 0.55);
  const minEnd = hand(minAngle, r * 0.75);
  const secEnd = hand(secAngle, r * 0.85);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Face */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-border" />
      {/* Hour marks */}
      {Array.from({ length: 12 }).map((_, i) => {
        const angle = i * 30;
        const rad = toRad(angle);
        const inner = r * 0.85;
        const outer = r * 0.95;
        return (
          <line key={i}
            x1={cx + inner * Math.cos(rad)} y1={cy + inner * Math.sin(rad)}
            x2={cx + outer * Math.cos(rad)} y2={cy + outer * Math.sin(rad)}
            stroke="currentColor" strokeWidth={i % 3 === 0 ? 2 : 1} className="text-text-muted" />
        );
      })}
      {/* Hour hand */}
      <line x1={cx} y1={cy} x2={hourEnd.x} y2={hourEnd.y}
        stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-text-primary" />
      {/* Minute hand */}
      <line x1={cx} y1={cy} x2={minEnd.x} y2={minEnd.y}
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-text-secondary" />
      {/* Second hand */}
      <line x1={cx} y1={cy} x2={secEnd.x} y2={secEnd.y}
        stroke="#e94560" strokeWidth="1" strokeLinecap="round" />
      {/* Center dot */}
      <circle cx={cx} cy={cy} r={2} fill="#e94560" />
    </svg>
  );
}

// ── World Clocks Tab ──────────────────────────────────────────────────────────
function WorldClocksTab() {
  const [now, setNow] = useState(new Date());
  const [cities, setCities] = useState<City[]>(ALL_CITIES.slice(0, 6));
  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const filteredCities = ALL_CITIES.filter(c =>
    !cities.find(sc => sc.tz === c.tz) &&
    (c.name.includes(search) || c.country.includes(search) || c.tz.toLowerCase().includes(search.toLowerCase()))
  );

  const addCity = (city: City) => {
    if (cities.length < 12) setCities(prev => [...prev, city]);
    setSearch('');
    setShowDropdown(false);
  };

  const removeCity = (tz: string) => setCities(prev => prev.filter(c => c.tz !== tz));

  return (
    <div className="space-y-4">
      {/* Add city */}
      <div className="relative">
        <input value={search} onChange={e => { setSearch(e.target.value); setShowDropdown(true); }}
          onFocus={() => setShowDropdown(true)}
          placeholder="도시 검색하여 추가 (최대 12개)..."
          className="w-full bg-background-card border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-[#e94560]" />
        {showDropdown && filteredCities.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-background-card border border-border rounded-xl shadow-lg z-10 max-h-52 overflow-y-auto">
            {filteredCities.map(city => (
              <button key={city.tz} onClick={() => addCity(city)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-background text-left transition-colors">
                <span className="text-xl">{city.flag}</span>
                <div>
                  <p className="text-sm font-medium text-text-primary">{city.name}</p>
                  <p className="text-xs text-text-muted">{city.tz}</p>
                </div>
              </button>
            ))}
          </div>
        )}
        {showDropdown && (
          <div className="fixed inset-0 z-0" onClick={() => setShowDropdown(false)} />
        )}
      </div>

      {/* Clock grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        {cities.map(city => {
          const t = getTimeInTz(city.tz, now);
          return (
            <div key={city.tz} className="bg-background-card border border-border rounded-xl p-4 relative group">
              <button onClick={() => removeCity(city.tz)}
                className="absolute top-2 right-2 w-5 h-5 rounded-full bg-border text-text-muted hover:bg-red-500 hover:text-white text-xs opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                ×
              </button>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">{city.flag}</span>
                <div>
                  <p className="text-sm font-semibold text-text-primary">{city.name}</p>
                  <p className="text-xs text-text-muted">{t.offset}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <AnalogClock h={t.h} m={t.m} s={t.s} />
                <div>
                  <p className="text-lg font-bold font-mono text-text-primary tabular-nums">{t.time}</p>
                  <p className="text-xs text-text-muted">{t.date}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Meeting Planner Tab ───────────────────────────────────────────────────────
function MeetingPlannerTab() {
  const [now, setNow] = useState(new Date());
  const [selectedCities, setSelectedCities] = useState<City[]>(ALL_CITIES.slice(0, 3));
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const getHourType = (h: number): 'sleep' | 'edge' | 'business' => {
    if (h >= 0 && h < 7) return 'sleep';
    if (h >= 7 && h < 9) return 'edge';
    if (h >= 9 && h < 18) return 'business';
    if (h >= 18 && h < 22) return 'edge';
    return 'sleep';
  };

  const hourColors = {
    sleep: 'bg-red-500/15 text-red-500',
    edge: 'bg-yellow-500/15 text-yellow-600',
    business: 'bg-green-500/15 text-green-600',
  };

  const isOptimal = (baseHour: number) =>
    selectedCities.every(city => {
      const t = getTimeInTz(city.tz, new Date(now.getTime() + (baseHour - now.getHours()) * 3600000));
      return getHourType(t.h) === 'business';
    });

  const filteredAdd = ALL_CITIES.filter(c =>
    !selectedCities.find(sc => sc.tz === c.tz) &&
    (c.name.includes(search) || c.country.includes(search))
  );

  const removeCity = (tz: string) => setSelectedCities(prev => prev.filter(c => c.tz !== tz));

  return (
    <div className="space-y-4">
      {/* City selector */}
      <div className="bg-background-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-secondary">도시 선택 (최대 5개)</h3>
          <div className="flex gap-2 flex-wrap">
            {selectedCities.map(c => (
              <span key={c.tz} className="flex items-center gap-1 px-2 py-1 bg-background rounded-lg text-xs text-text-secondary">
                {c.flag} {c.name}
                <button onClick={() => removeCity(c.tz)} className="text-text-muted hover:text-red-500 ml-0.5">×</button>
              </span>
            ))}
          </div>
        </div>
        {selectedCities.length < 5 && (
          <div className="relative">
            <input value={search} onChange={e => { setSearch(e.target.value); setShowDropdown(true); }}
              onFocus={() => setShowDropdown(true)}
              placeholder="도시 추가..."
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-[#e94560]" />
            {showDropdown && filteredAdd.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-background-card border border-border rounded-xl shadow-lg z-10 max-h-40 overflow-y-auto">
                {filteredAdd.map(city => (
                  <button key={city.tz} onClick={() => { setSelectedCities(prev => [...prev, city]); setSearch(''); setShowDropdown(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-background text-left transition-colors text-sm">
                    <span>{city.flag}</span><span className="text-text-primary">{city.name}</span>
                  </button>
                ))}
              </div>
            )}
            {showDropdown && <div className="fixed inset-0 z-0" onClick={() => setShowDropdown(false)} />}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500/30 inline-block" />업무 시간 (9-18시)</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-500/30 inline-block" />이른/늦은 시간</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500/30 inline-block" />취침 시간 (0-7시)</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-500/30 inline-block" />최적 시간대</span>
      </div>

      {/* Table */}
      <div className="bg-background-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left text-xs text-text-muted font-medium w-16">UTC</th>
                {selectedCities.map(c => (
                  <th key={c.tz} className="px-3 py-2 text-center text-xs text-text-muted font-medium whitespace-nowrap">
                    {c.flag} {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 24 }).map((_, baseH) => {
                const optimal = isOptimal(baseH);
                const baseDate = new Date(now);
                baseDate.setHours(baseH, 0, 0, 0);
                return (
                  <tr key={baseH}
                    onClick={() => setSelectedHour(selectedHour === baseH ? null : baseH)}
                    className={`border-b border-border/50 cursor-pointer transition-colors ${
                      selectedHour === baseH ? 'bg-[#e94560]/10 border-[#e94560]/30' :
                      optimal ? 'bg-blue-500/5 hover:bg-blue-500/10' : 'hover:bg-background'
                    }`}>
                    <td className="px-3 py-1.5 text-xs text-text-muted font-mono">
                      {String(baseH).padStart(2, '0')}:00
                      {optimal && <span className="ml-1 text-blue-500">★</span>}
                    </td>
                    {selectedCities.map(city => {
                      const t = getTimeInTz(city.tz, baseDate);
                      const type = getHourType(t.h);
                      return (
                        <td key={city.tz} className={`px-3 py-1.5 text-center font-mono text-xs ${hourColors[type]}`}>
                          {String(t.h).padStart(2, '0')}:00
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedHour !== null && (
        <div className="bg-background-card border border-[#e94560]/30 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-[#e94560] mb-3">
            선택된 시간: {String(selectedHour).padStart(2, '0')}:00 (로컬)
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {selectedCities.map(city => {
              const baseDate = new Date(now);
              baseDate.setHours(selectedHour, 0, 0, 0);
              const t = getTimeInTz(city.tz, baseDate);
              const type = getHourType(t.h);
              return (
                <div key={city.tz} className={`p-3 rounded-lg ${hourColors[type]}`}>
                  <p className="text-sm font-semibold">{city.flag} {city.name}</p>
                  <p className="font-mono font-bold text-lg">{String(t.h).padStart(2, '0')}:00</p>
                  <p className="text-xs opacity-75">{t.offset}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Stopwatch & Timer Tab ─────────────────────────────────────────────────────
function StopwatchTimerTab() {
  // Stopwatch state
  const [swRunning, setSwRunning] = useState(false);
  const [swMs, setSwMs] = useState(0);
  const [laps, setLaps] = useState<number[]>([]);
  const swInterval = useRef<NodeJS.Timeout | null>(null);
  const swStart = useRef<number>(0);
  const swAccum = useRef<number>(0);

  // Timer state
  const [timerMs, setTimerMs] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerDone, setTimerDone] = useState(false);
  const [timerInput, setTimerInput] = useState('');
  const [customMinutes, setCustomMinutes] = useState('');
  const timerInterval = useRef<NodeJS.Timeout | null>(null);
  const timerRemaining = useRef<number>(0);

  const formatMs = (ms: number): string => {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const cs = Math.floor((ms % 1000) / 10);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  };

  const formatTimer = (ms: number): string => {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Stopwatch
  const swToggle = () => {
    if (swRunning) {
      clearInterval(swInterval.current!);
      swAccum.current += Date.now() - swStart.current;
    } else {
      swStart.current = Date.now();
      swInterval.current = setInterval(() => {
        setSwMs(swAccum.current + Date.now() - swStart.current);
      }, 10);
    }
    setSwRunning(r => !r);
  };
  const swReset = () => {
    clearInterval(swInterval.current!);
    setSwRunning(false);
    setSwMs(0);
    setLaps([]);
    swAccum.current = 0;
  };
  const swLap = () => {
    if (swRunning) setLaps(prev => [swMs, ...prev]);
  };

  // Timer
  const startTimer = (ms: number) => {
    clearInterval(timerInterval.current!);
    setTimerDone(false);
    setTimerMs(ms);
    timerRemaining.current = ms;
    setTimerRunning(true);
    timerInterval.current = setInterval(() => {
      timerRemaining.current -= 100;
      if (timerRemaining.current <= 0) {
        clearInterval(timerInterval.current!);
        setTimerMs(0);
        setTimerRunning(false);
        setTimerDone(true);
        // Play a beep
        try {
          const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
          const osc = ctx.createOscillator();
          osc.connect(ctx.destination);
          osc.frequency.value = 880;
          osc.start();
          osc.stop(ctx.currentTime + 0.5);
        } catch {}
      } else {
        setTimerMs(timerRemaining.current);
      }
    }, 100);
  };

  const timerToggle = () => {
    if (timerRunning) {
      clearInterval(timerInterval.current!);
      setTimerRunning(false);
    } else if (timerMs > 0) {
      timerRemaining.current = timerMs;
      timerInterval.current = setInterval(() => {
        timerRemaining.current -= 100;
        if (timerRemaining.current <= 0) {
          clearInterval(timerInterval.current!);
          setTimerMs(0);
          setTimerRunning(false);
          setTimerDone(true);
        } else {
          setTimerMs(timerRemaining.current);
        }
      }, 100);
      setTimerRunning(true);
    }
  };

  const timerReset = () => {
    clearInterval(timerInterval.current!);
    setTimerRunning(false);
    setTimerMs(0);
    setTimerDone(false);
    timerRemaining.current = 0;
  };

  const presets = [
    { label: '1분', ms: 60000 },
    { label: '5분', ms: 300000 },
    { label: '10분', ms: 600000 },
    { label: '25분', ms: 1500000 },
    { label: '30분', ms: 1800000 },
    { label: '1시간', ms: 3600000 },
  ];

  useEffect(() => () => {
    clearInterval(swInterval.current!);
    clearInterval(timerInterval.current!);
  }, []);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Stopwatch */}
      <div className="bg-background-card border border-border rounded-xl p-6 space-y-4">
        <h3 className="text-base font-semibold text-text-primary">스톱워치</h3>
        <div className="text-center">
          <p className="text-5xl font-bold font-mono text-text-primary tabular-nums">{formatMs(swMs)}</p>
        </div>
        <div className="flex gap-3 justify-center">
          <button onClick={swToggle}
            className={`px-6 py-2 rounded-xl font-semibold transition-colors ${
              swRunning ? 'bg-yellow-500 hover:bg-yellow-600 text-white' : 'bg-[#e94560] hover:bg-[#c73652] text-white'
            }`}>
            {swRunning ? '일시정지' : '시작'}
          </button>
          {swRunning && (
            <button onClick={swLap}
              className="px-4 py-2 rounded-xl font-semibold bg-background border border-border text-text-secondary hover:text-text-primary transition-colors">
              랩
            </button>
          )}
          <button onClick={swReset}
            className="px-4 py-2 rounded-xl font-semibold bg-background border border-border text-text-secondary hover:text-text-primary transition-colors">
            리셋
          </button>
        </div>
        {laps.length > 0 && (
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {laps.map((lap, i) => (
              <div key={i} className="flex justify-between px-3 py-1.5 bg-background rounded-lg text-sm">
                <span className="text-text-muted">랩 {laps.length - i}</span>
                <span className="font-mono text-text-primary">{formatMs(lap)}</span>
                {i > 0 && (
                  <span className="font-mono text-text-muted text-xs">+{formatMs(laps[i - 1] - lap)}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Timer */}
      <div className="bg-background-card border border-border rounded-xl p-6 space-y-4">
        <h3 className="text-base font-semibold text-text-primary">타이머</h3>
        <div className="text-center">
          <p className={`text-5xl font-bold font-mono tabular-nums ${timerDone ? 'text-[#e94560]' : 'text-text-primary'}`}>
            {timerDone ? '완료!' : formatTimer(timerMs)}
          </p>
        </div>

        {/* Presets */}
        <div className="grid grid-cols-3 gap-2">
          {presets.map(({ label, ms }) => (
            <button key={label} onClick={() => startTimer(ms)}
              className="py-1.5 rounded-lg text-sm bg-background border border-border text-text-secondary hover:border-[#e94560] hover:text-[#e94560] transition-colors">
              {label}
            </button>
          ))}
        </div>

        {/* Custom */}
        <div className="flex gap-2">
          <input type="number" value={customMinutes} onChange={e => setCustomMinutes(e.target.value)}
            placeholder="분 입력..."
            className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-[#e94560]" />
          <button onClick={() => { const m = Number(customMinutes); if (m > 0) startTimer(m * 60000); }}
            className="px-3 py-2 rounded-lg bg-[#e94560] text-white text-sm font-medium hover:bg-[#c73652] transition-colors">
            설정
          </button>
        </div>

        <div className="flex gap-3 justify-center">
          <button onClick={timerToggle} disabled={timerMs === 0 && !timerRunning}
            className={`px-6 py-2 rounded-xl font-semibold transition-colors disabled:opacity-40 ${
              timerRunning ? 'bg-yellow-500 hover:bg-yellow-600 text-white' : 'bg-[#e94560] hover:bg-[#c73652] text-white'
            }`}>
            {timerRunning ? '일시정지' : '시작'}
          </button>
          <button onClick={timerReset}
            className="px-4 py-2 rounded-xl font-semibold bg-background border border-border text-text-secondary hover:text-text-primary transition-colors">
            리셋
          </button>
        </div>

        {timerDone && (
          <div className="p-3 bg-[#e94560]/10 border border-[#e94560]/30 rounded-xl text-center text-[#e94560] font-semibold text-sm">
            ⏰ 타이머가 완료되었습니다!
          </div>
        )}
      </div>
    </div>
  );
}

// ── Date Calculation Tab ──────────────────────────────────────────────────────
function DateCalcTab() {
  const [dateA, setDateA] = useState('');
  const [dateB, setDateB] = useState('');
  const [diffResult, setDiffResult] = useState<{ days: number; weeks: number; months: number; years: number } | null>(null);

  const [addDate, setAddDate] = useState('');
  const [addAmount, setAddAmount] = useState('0');
  const [addUnit, setAddUnit] = useState<'days' | 'weeks' | 'months' | 'years'>('days');
  const [addOperation, setAddOperation] = useState<'add' | 'subtract'>('add');
  const [addResult, setAddResult] = useState('');

  const [convDate, setConvDate] = useState('');
  const [convTime, setConvTime] = useState('12:00');
  const [convFromTz, setConvFromTz] = useState('Asia/Seoul');
  const [convResults, setConvResults] = useState<{ city: City; time: string; date: string }[]>([]);

  const computeDiff = () => {
    if (!dateA || !dateB) return;
    const a = new Date(dateA), b = new Date(dateB);
    const diffMs = Math.abs(b.getTime() - a.getTime());
    const days = Math.floor(diffMs / 86400000);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30.44);
    const years = Math.floor(days / 365.25);
    setDiffResult({ days, weeks, months, years });
  };

  const computeAdd = () => {
    if (!addDate) return;
    const d = new Date(addDate);
    const n = parseInt(addAmount) * (addOperation === 'subtract' ? -1 : 1);
    if (isNaN(n)) return;
    switch (addUnit) {
      case 'days': d.setDate(d.getDate() + n); break;
      case 'weeks': d.setDate(d.getDate() + n * 7); break;
      case 'months': d.setMonth(d.getMonth() + n); break;
      case 'years': d.setFullYear(d.getFullYear() + n); break;
    }
    setAddResult(d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }));
  };

  const computeConvert = () => {
    if (!convDate || !convTime) return;
    // Interpret the input datetime as being in convFromTz.
    // We create a UTC-based Date by finding what UTC moment corresponds to that local time.
    const localStr = `${convDate}T${convTime}:00`;
    // Use Intl to find the UTC offset for convFromTz at approximately that time
    const approxDate = new Date(localStr + 'Z');
    const tzDate = new Date(approxDate.toLocaleString('en-US', { timeZone: convFromTz }));
    const utcDate = new Date(approxDate.toLocaleString('en-US', { timeZone: 'UTC' }));
    const offsetMs = tzDate.getTime() - utcDate.getTime();
    const sourceDate = new Date(approxDate.getTime() - offsetMs);
    const results = ALL_CITIES.map(city => {
      const t = getTimeInTz(city.tz, sourceDate);
      return { city, time: t.time, date: t.date };
    });
    setConvResults(results);
  };

  return (
    <div className="space-y-6">
      {/* Date difference */}
      <div className="bg-background-card border border-border rounded-xl p-5 space-y-4">
        <h3 className="text-base font-semibold text-text-primary">날짜 차이 계산</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-text-muted mb-1 block">시작 날짜</label>
            <input type="date" value={dateA} onChange={e => setDateA(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-[#e94560]" />
          </div>
          <div>
            <label className="text-xs text-text-muted mb-1 block">종료 날짜</label>
            <input type="date" value={dateB} onChange={e => setDateB(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-[#e94560]" />
          </div>
        </div>
        <button onClick={computeDiff}
          className="w-full bg-[#e94560] hover:bg-[#c73652] text-white font-semibold py-2 px-4 rounded-lg transition-colors">
          계산
        </button>
        {diffResult && (
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: '일', value: diffResult.days.toLocaleString() },
              { label: '주', value: diffResult.weeks.toLocaleString() },
              { label: '개월', value: diffResult.months.toLocaleString() },
              { label: '년', value: diffResult.years.toLocaleString() },
            ].map(({ label, value }) => (
              <div key={label} className="bg-background rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-[#e94560]">{value}</p>
                <p className="text-xs text-text-muted mt-1">{label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Subtract */}
      <div className="bg-background-card border border-border rounded-xl p-5 space-y-4">
        <h3 className="text-base font-semibold text-text-primary">날짜 더하기 / 빼기</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-text-muted mb-1 block">기준 날짜</label>
            <input type="date" value={addDate} onChange={e => setAddDate(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-[#e94560]" />
          </div>
          <div>
            <label className="text-xs text-text-muted mb-1 block">수량</label>
            <input type="number" value={addAmount} onChange={e => setAddAmount(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-[#e94560]" />
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['days', 'weeks', 'months', 'years'] as const).map(u => (
            <button key={u} onClick={() => setAddUnit(u)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                addUnit === u ? 'bg-[#e94560] text-white' : 'bg-background border border-border text-text-secondary hover:text-text-primary'
              }`}>
              {u === 'days' ? '일' : u === 'weeks' ? '주' : u === 'months' ? '월' : '년'}
            </button>
          ))}
          <div className="flex gap-2 ml-auto">
            {(['add', 'subtract'] as const).map(op => (
              <button key={op} onClick={() => setAddOperation(op)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  addOperation === op ? 'bg-[#e94560] text-white' : 'bg-background border border-border text-text-secondary'
                }`}>
                {op === 'add' ? '더하기' : '빼기'}
              </button>
            ))}
          </div>
        </div>
        <button onClick={computeAdd}
          className="w-full bg-[#e94560] hover:bg-[#c73652] text-white font-semibold py-2 px-4 rounded-lg transition-colors">
          계산
        </button>
        {addResult && (
          <div className="bg-background rounded-lg p-3 text-center text-text-primary font-semibold">{addResult}</div>
        )}
      </div>

      {/* Timezone convert */}
      <div className="bg-background-card border border-border rounded-xl p-5 space-y-4">
        <h3 className="text-base font-semibold text-text-primary">시간대 변환</h3>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-text-muted mb-1 block">날짜</label>
            <input type="date" value={convDate} onChange={e => setConvDate(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-[#e94560]" />
          </div>
          <div>
            <label className="text-xs text-text-muted mb-1 block">시간</label>
            <input type="time" value={convTime} onChange={e => setConvTime(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-[#e94560]" />
          </div>
          <div>
            <label className="text-xs text-text-muted mb-1 block">기준 시간대</label>
            <select value={convFromTz} onChange={e => setConvFromTz(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-[#e94560]">
              {ALL_CITIES.map(c => (
                <option key={c.tz} value={c.tz}>{c.flag} {c.name} ({c.tz})</option>
              ))}
            </select>
          </div>
        </div>
        <button onClick={computeConvert}
          className="w-full bg-[#e94560] hover:bg-[#c73652] text-white font-semibold py-2 px-4 rounded-lg transition-colors">
          모든 시간대로 변환
        </button>
        {convResults.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-72 overflow-y-auto">
            {convResults.map(({ city, time, date }) => (
              <div key={city.tz} className="bg-background rounded-lg px-3 py-2">
                <p className="text-xs text-text-muted">{city.flag} {city.name}</p>
                <p className="font-mono text-sm text-text-primary font-semibold">{time}</p>
                <p className="text-xs text-text-muted">{date}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function WorldClockPage() {
  const [tab, setTab] = useState<Tab>('clocks');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'clocks', label: '세계 시계' },
    { key: 'meeting', label: '회의 계획' },
    { key: 'stopwatch', label: '스톱워치/타이머' },
    { key: 'datecalc', label: '날짜 계산' },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-background-card px-6 py-4">
        <h1 className="text-2xl font-bold text-text-primary">🌍 세계 시각</h1>
        <p className="text-sm text-text-muted mt-1">세계 시계, 회의 계획, 스톱워치/타이머, 날짜 계산</p>
      </div>

      {/* Tab bar */}
      <div className="border-b border-border bg-background-card px-6">
        <div className="flex gap-1">
          {tabs.map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab === key
                  ? 'border-[#e94560] text-[#e94560]'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-6 max-w-7xl mx-auto">
        {tab === 'clocks' && <WorldClocksTab />}
        {tab === 'meeting' && <MeetingPlannerTab />}
        {tab === 'stopwatch' && <StopwatchTimerTab />}
        {tab === 'datecalc' && <DateCalcTab />}
      </div>

      <FloatingAIBar getContext={() => ({ page: "world-clock" })} getAction={() => "chat"} onResult={() => {}} placeholder="세계 시각에 대해 질문하세요..." />
    </div>
  );
}
