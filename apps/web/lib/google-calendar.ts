import { GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult } from 'firebase/auth';
import { auth } from './firebase';

const SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly';
const TOKEN_KEY = 'gcal_access_token';
const EXPIRY_KEY = 'gcal_token_expiry';
const CONNECTED_KEY = 'gcal_connected';
const PENDING_REDIRECT_KEY = 'gcal_pending_redirect';

function storeToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(EXPIRY_KEY, String(Date.now() + 55 * 60 * 1000));
  localStorage.setItem(CONNECTED_KEY, '1');
}

export function getStoredGCalToken(): string | null {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem(TOKEN_KEY);
  const expiry = localStorage.getItem(EXPIRY_KEY);
  if (!token || !expiry) return null;
  if (Date.now() > parseInt(expiry, 10)) {
    // 토큰 만료 — 토큰만 제거, connected 플래그는 유지
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXPIRY_KEY);
    return null;
  }
  return token;
}

/** 사용자가 이전에 Google Calendar을 연동한 적이 있는지 확인 */
export function isGCalConnected(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(CONNECTED_KEY) === '1';
}

export function disconnectGoogleCalendar() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EXPIRY_KEY);
  localStorage.removeItem(CONNECTED_KEY);
  localStorage.removeItem(PENDING_REDIRECT_KEY);
}

/**
 * 토큰 만료 시 자동 재인증 — prompt 없이 signInWithPopup 시도.
 * 이미 Google 세션이 있으면 팝업이 즉시 닫히며 새 토큰 발급.
 * 실패 시 null 반환 (수동 재연결 필요).
 */
export async function silentReconnectGCal(): Promise<string | null> {
  try {
    const provider = new GoogleAuthProvider();
    provider.addScope(SCOPE);
    // prompt: 'none'으로 사일런트 재인증 시도
    provider.setCustomParameters({ prompt: 'none' });
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken;
    if (!token) return null;
    storeToken(token);
    return token;
  } catch {
    // 사일런트 실패 — select_account로 한 번 더 시도 (빠른 팝업)
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope(SCOPE);
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;
      if (!token) return null;
      storeToken(token);
      return token;
    } catch {
      return null;
    }
  }
}

// ── Web (popup) ───────────────────────────────────────────────────────────────

export async function connectGoogleCalendar(): Promise<string> {
  const provider = new GoogleAuthProvider();
  provider.addScope(SCOPE);
  provider.setCustomParameters({ prompt: 'consent' });
  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const token = credential?.accessToken;
  if (!token) throw new Error('no_token');
  storeToken(token);
  return token;
}

// ── Tauri Desktop (system browser + local OAuth server) ───────────────────────

export async function connectGoogleCalendarDesktop(params: {
  apiKey: string;
  authDomain: string;
  projectId: string;
}): Promise<string> {
  const { invoke } = await import('@tauri-apps/api/core');
  const { open } = await import('@tauri-apps/plugin-shell');
  const { listen } = await import('@tauri-apps/api/event');

  const port = await invoke<number>('start_gcal_oauth_server');

  return new Promise<string>((resolve, reject) => {
    const url = new URL(`http://localhost:${port}/`);
    url.searchParams.set('apiKey', params.apiKey);
    url.searchParams.set('authDomain', params.authDomain);
    url.searchParams.set('projectId', params.projectId);

    let unlisten: (() => void) | null = null;

    const timeout = setTimeout(() => {
      if (unlisten) unlisten();
      reject(new Error('timeout'));
    }, 120000);

    listen<string>('gcal-oauth-callback', (event) => {
      clearTimeout(timeout);
      if (unlisten) unlisten();
      try {
        const data = JSON.parse(event.payload);
        const token = data.accessToken;
        if (!token) { reject(new Error('no_token')); return; }
        storeToken(token);
        resolve(token);
      } catch {
        reject(new Error('parse_failed'));
      }
    }).then(fn => { unlisten = fn; });

    open(url.toString());
  });
}

// ── Tauri Mobile (signInWithRedirect within WebView) ─────────────────────────

export async function connectGoogleCalendarRedirect(): Promise<void> {
  const provider = new GoogleAuthProvider();
  provider.addScope(SCOPE);
  provider.setCustomParameters({ prompt: 'consent' });
  localStorage.setItem(PENDING_REDIRECT_KEY, '1');
  await signInWithRedirect(auth, provider);
}

/** Call on mount — resolves to access token if a redirect just completed */
export async function checkGCalRedirectResult(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  if (localStorage.getItem(PENDING_REDIRECT_KEY) !== '1') return null;
  localStorage.removeItem(PENDING_REDIRECT_KEY);
  try {
    const result = await getRedirectResult(auth);
    if (!result) return null;
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken;
    if (!token) return null;
    storeToken(token);
    return token;
  } catch {
    return null;
  }
}

// ── Shared ────────────────────────────────────────────────────────────────────

export interface GCalEvent {
  id: string;
  summary?: string;
  start: { date?: string; dateTime?: string };
  end: { date?: string; dateTime?: string };
  colorId?: string;
}

const COLOR_MAP: Record<string, string> = {
  '1': '#7986CB', '2': '#33B679', '3': '#8E24AA', '4': '#E67C73',
  '5': '#F6BF26', '6': '#F4511E', '7': '#039BE5', '8': '#616161',
  '9': '#3F51B5', '10': '#0B8043', '11': '#D50000',
};

export function gcalColor(colorId?: string): string {
  return colorId ? (COLOR_MAP[colorId] ?? '#4285F4') : '#4285F4';
}

export async function fetchGCalEvents(
  accessToken: string,
  timeMin: Date,
  timeMax: Date,
): Promise<GCalEvent[]> {
  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.searchParams.set('timeMin', timeMin.toISOString());
  url.searchParams.set('timeMax', timeMax.toISOString());
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('maxResults', '250');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('token_expired');
    throw new Error('fetch_failed');
  }
  const data = await res.json();
  return (data.items ?? []) as GCalEvent[];
}
