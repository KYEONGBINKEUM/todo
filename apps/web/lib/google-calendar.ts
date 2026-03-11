import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import { auth } from './firebase';

// ── 서버 기반 OAuth (Cloud Function) ──────────────────────────────────────────
// refresh token을 Firestore에 서버에서 저장하므로 영구 연동 가능

const CONNECTED_KEY = 'gcal_connected';

async function setGCalConnectedFirestore(connected: boolean) {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  try {
    const db = getFirestore();
    await setDoc(doc(db, `users/${uid}/settings/app`), { gcalConnected: connected }, { merge: true });
  } catch { /* non-critical */ }
}

/** 사용자가 이전에 Google Calendar을 연동한 적이 있는지 확인 */
export function isGCalConnected(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(CONNECTED_KEY) === '1';
}

export function markGCalConnected(connected: boolean) {
  if (connected) {
    localStorage.setItem(CONNECTED_KEY, '1');
  } else {
    localStorage.removeItem(CONNECTED_KEY);
  }
}

// ── 웹: Firebase 팝업 OAuth (즉시 토큰 획득, 세션 한정) ──────────────────────

/**
 * Firebase signInWithPopup으로 Google Calendar 연동
 * access token을 즉시 반환 (약 1시간 유효, 세션 내 사용)
 */
export async function connectGoogleCalendar(): Promise<string> {
  const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
  const provider = new GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/calendar.events.readonly');
  provider.setCustomParameters({ prompt: 'consent' });
  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const token = credential?.accessToken;
  if (!token) throw new Error('no_token');
  markGCalConnected(true);
  setGCalConnectedFirestore(true);
  return token;
}

// ── 웹: Cloud Function OAuth URL로 리다이렉트 ──────────────────────────────

/**
 * Cloud Function에서 Google OAuth URL 받아서 새 창으로 열기
 * → Google 인증 → gcalOAuthCallback 함수로 리다이렉트
 * → Firestore에 refresh token 저장 → 앱으로 복귀
 */
export async function connectGoogleCalendarServer(): Promise<void> {
  const functions = getFunctions();
  const getOAuthUrl = httpsCallable<{}, { url: string }>(functions, 'gcalGetOAuthUrl');
  const result = await getOAuthUrl({});
  const url = result.data.url;
  // 현재 탭에서 이동 (팝업 차단 우회)
  window.location.href = url;
}

/**
 * Cloud Function에서 유효한 access token 조회
 * 만료 시 서버에서 refresh token으로 자동 갱신
 */
export async function getGCalTokenFromServer(): Promise<string> {
  const functions = getFunctions();
  const getToken = httpsCallable<{}, { accessToken: string }>(functions, 'gcalGetToken');
  const result = await getToken({});
  return result.data.accessToken;
}

/**
 * 연결 해제 (서버 + 로컬)
 */
export async function disconnectGoogleCalendar(): Promise<void> {
  localStorage.removeItem(CONNECTED_KEY);
  try {
    const functions = getFunctions();
    const disconnect = httpsCallable(functions, 'gcalDisconnect');
    await disconnect({});
  } catch { /* ignore */ }
}

// ── Tauri Desktop (기존 방식 유지 — 로컬 OAuth 서버) ─────────────────────────

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
        markGCalConnected(true);
        setGCalConnectedFirestore(true);
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
  const { GoogleAuthProvider, signInWithRedirect } = await import('firebase/auth');
  const provider = new GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/calendar.events.readonly');
  provider.setCustomParameters({ prompt: 'consent' });
  localStorage.setItem('gcal_pending_redirect', '1');
  await signInWithRedirect(auth, provider);
}

/** Call on mount — resolves to access token if a redirect just completed */
export async function checkGCalRedirectResult(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  if (localStorage.getItem('gcal_pending_redirect') !== '1') return null;
  localStorage.removeItem('gcal_pending_redirect');
  try {
    const { GoogleAuthProvider, getRedirectResult } = await import('firebase/auth');
    const result = await getRedirectResult(auth);
    if (!result) return null;
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken;
    if (!token) return null;
    markGCalConnected(true);
    setGCalConnectedFirestore(true);
    return token;
  } catch {
    return null;
  }
}

// ── gcal_success=1 URL 파라미터 처리 (서버 OAuth 콜백 후 복귀) ──────────────

export function checkGCalOAuthReturn(): { success: boolean; error?: string } | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const success = params.get('gcal_success');
  const error = params.get('gcal_error');

  if (!success && !error) return null;

  // URL 파라미터 제거 (히스토리 교체)
  const clean = new URL(window.location.href);
  clean.searchParams.delete('gcal_success');
  clean.searchParams.delete('gcal_error');
  window.history.replaceState({}, '', clean.toString());

  if (success === '1') {
    markGCalConnected(true);
    return { success: true };
  }
  return { success: false, error: error ?? 'unknown' };
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
