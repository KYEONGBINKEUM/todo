// Calendar settings — stored in localStorage

export interface CalSettings {
  weekStart: 'sun' | 'mon';
  holidayCountries: string[];  // e.g. ['KR', 'US']
  notifications: boolean;
  showInTasks: boolean;
  showInUpcoming: boolean;
}

const KEY = 'cal_settings_v2';

const DEFAULTS: CalSettings = {
  weekStart: 'sun',
  holidayCountries: [],
  notifications: false,
  showInTasks: false,
  showInUpcoming: false,
};

export function getCalSettings(): CalSettings {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch { return DEFAULTS; }
}

export function saveCalSettings(patch: Partial<CalSettings>): CalSettings {
  const next = { ...getCalSettings(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

// ── Country list ─────────────────────────────────────────────────────────────

export const HOLIDAY_COUNTRIES = [
  { code: 'KR', name: '대한민국', flag: '🇰🇷' },
  { code: 'US', name: '미국',     flag: '🇺🇸' },
  { code: 'JP', name: '일본',     flag: '🇯🇵' },
  { code: 'CN', name: '중국',     flag: '🇨🇳' },
  { code: 'GB', name: '영국',     flag: '🇬🇧' },
  { code: 'DE', name: '독일',     flag: '🇩🇪' },
  { code: 'FR', name: '프랑스',   flag: '🇫🇷' },
  { code: 'IT', name: '이탈리아', flag: '🇮🇹' },
  { code: 'ES', name: '스페인',   flag: '🇪🇸' },
  { code: 'AU', name: '호주',     flag: '🇦🇺' },
  { code: 'CA', name: '캐나다',   flag: '🇨🇦' },
  { code: 'BR', name: '브라질',   flag: '🇧🇷' },
  { code: 'IN', name: '인도',     flag: '🇮🇳' },
  { code: 'SG', name: '싱가포르', flag: '🇸🇬' },
  { code: 'TH', name: '태국',     flag: '🇹🇭' },
  { code: 'VN', name: '베트남',   flag: '🇻🇳' },
  { code: 'MY', name: '말레이시아', flag: '🇲🇾' },
  { code: 'PH', name: '필리핀',   flag: '🇵🇭' },
  { code: 'ID', name: '인도네시아', flag: '🇮🇩' },
  { code: 'NZ', name: '뉴질랜드', flag: '🇳🇿' },
  { code: 'RU', name: '러시아',   flag: '🇷🇺' },
  { code: 'MX', name: '멕시코',   flag: '🇲🇽' },
];

// ── Holiday fetching (Nager.Date public API) ─────────────────────────────────

export interface HolidayEntry {
  date: string;        // YYYY-MM-DD
  name: string;
  countryCode: string;
}

function hKey(year: number, cc: string) { return `cal_hol_${year}_${cc}`; }

export async function fetchHolidaysForYear(
  year: number,
  countryCode: string,
): Promise<HolidayEntry[]> {
  if (typeof window === 'undefined') return [];
  const key = hKey(year, countryCode);
  const cached = localStorage.getItem(key);
  if (cached) {
    try { return JSON.parse(cached) as HolidayEntry[]; } catch { /* fall through */ }
  }
  try {
    const res = await fetch(
      `https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`,
    );
    if (!res.ok) return [];
    const data = await res.json() as Array<{ date: string; name: string; localName: string }>;
    const entries: HolidayEntry[] = data.map(h => ({
      date: h.date,
      name: h.localName || h.name,
      countryCode,
    }));
    localStorage.setItem(key, JSON.stringify(entries));
    return entries;
  } catch { return []; }
}

export async function fetchAllHolidays(
  years: number[],
  countries: string[],
): Promise<HolidayEntry[]> {
  if (countries.length === 0) return [];
  const all = await Promise.all(
    years.flatMap(y => countries.map(cc => fetchHolidaysForYear(y, cc))),
  );
  return all.flat();
}

// ── Notifications ─────────────────────────────────────────────────────────────

const NOTIF_SHOWN_KEY = 'cal_notif_shown';

export function shouldShowNotification(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission !== 'granted') return false;
  const shown = localStorage.getItem(NOTIF_SHOWN_KEY);
  const today = new Date().toDateString();
  return shown !== today;
}

export function markNotificationShown() {
  localStorage.setItem(NOTIF_SHOWN_KEY, new Date().toDateString());
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  const result = await Notification.requestPermission();
  return result === 'granted';
}
