import * as admin from 'firebase-admin';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';

export const googleOAuthClientId = defineSecret('GOOGLE_OAUTH_CLIENT_ID');
export const googleOAuthClientSecret = defineSecret('GOOGLE_OAUTH_CLIENT_SECRET');

const GCAL_SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/** Cloud Function의 리다이렉트 URI — 배포 후 Google Cloud Console에 등록 필요 */
function getRedirectUri(req: { hostname: string }): string {
  const project = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT ?? '';
  const region = process.env.FUNCTION_REGION ?? 'us-central1';
  return `https://${region}-${project}.cloudfunctions.net/gcalOAuthCallback`;
}

// ── 1. OAuth 시작: 클라이언트에서 Google OAuth URL 요청 ─────────────────────

export const gcalGetOAuthUrl = onCall(
  { secrets: [googleOAuthClientId] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required');
    const uid = request.auth.uid;
    const clientId = googleOAuthClientId.value();

    const project = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT ?? '';
    const region = process.env.FUNCTION_REGION ?? 'us-central1';
    const redirectUri = `https://${region}-${project}.cloudfunctions.net/gcalOAuthCallback`;

    // state에 uid 포함 (CSRF 방지용 타임스탬프 포함)
    const state = Buffer.from(JSON.stringify({ uid, ts: Date.now() })).toString('base64');

    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', GCAL_SCOPE);
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent'); // refresh_token 항상 발급
    url.searchParams.set('state', state);

    return { url: url.toString() };
  }
);

// ── 2. OAuth 콜백: Google이 code와 함께 여기로 리다이렉트 ──────────────────

export const gcalOAuthCallback = onRequest(
  { secrets: [googleOAuthClientId, googleOAuthClientSecret] },
  async (req, res) => {
    const { code, state, error } = req.query as Record<string, string>;

    // 앱으로 돌아갈 URL (배포 도메인으로 변경)
    const appOrigin = 'https://aitodo.pages.dev';

    if (error || !code || !state) {
      console.error('[gcal-callback] error or missing params:', error);
      res.redirect(`${appOrigin}/calendar?gcal_error=access_denied`);
      return;
    }

    let uid: string;
    try {
      const parsed = JSON.parse(Buffer.from(state, 'base64').toString());
      uid = parsed.uid;
      // state가 10분 이상 된 것은 거부 (CSRF 방지)
      if (!uid || Date.now() - parsed.ts > 10 * 60 * 1000) throw new Error('invalid_state');
    } catch {
      res.redirect(`${appOrigin}/calendar?gcal_error=invalid_state`);
      return;
    }

    const project = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT ?? '';
    const region = process.env.FUNCTION_REGION ?? 'us-central1';
    const redirectUri = `https://${region}-${project}.cloudfunctions.net/gcalOAuthCallback`;

    // auth code → access + refresh token 교환
    try {
      const tokenRes = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: googleOAuthClientId.value(),
          client_secret: googleOAuthClientSecret.value(),
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        console.error('[gcal-callback] token exchange failed:', errText);
        res.redirect(`${appOrigin}/calendar?gcal_error=token_exchange_failed`);
        return;
      }

      const tokens = await tokenRes.json() as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
        token_type: string;
      };

      const db = admin.firestore();
      const ref = db.doc(`users/${uid}/private/gcal`);
      const update: Record<string, any> = {
        accessToken: tokens.access_token,
        expiresAt: Date.now() + (tokens.expires_in - 60) * 1000,
        connected: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (tokens.refresh_token) {
        update.refreshToken = tokens.refresh_token;
      }
      await ref.set(update, { merge: true });

      // settings/app에도 연결 상태 저장
      await db.doc(`users/${uid}/settings/app`).set(
        { gcalConnected: true },
        { merge: true }
      );

      console.log(`[gcal-callback] stored tokens for uid=${uid} hasRefresh=${!!tokens.refresh_token}`);
      res.redirect(`${appOrigin}/calendar?gcal_success=1`);
    } catch (err) {
      console.error('[gcal-callback] unexpected error:', err);
      res.redirect(`${appOrigin}/calendar?gcal_error=server_error`);
    }
  }
);

// ── 3. 토큰 조회: 클라이언트가 유효한 access token 요청 ────────────────────

export const gcalGetToken = onCall(
  { secrets: [googleOAuthClientId, googleOAuthClientSecret] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required');
    const uid = request.auth.uid;

    const db = admin.firestore();
    const snap = await db.doc(`users/${uid}/private/gcal`).get();
    if (!snap.exists) throw new HttpsError('not-found', 'GCal not connected');

    const data = snap.data()!;
    if (!data.connected) throw new HttpsError('not-found', 'GCal not connected');

    // 아직 유효한 토큰이면 그대로 반환
    if (data.accessToken && data.expiresAt > Date.now()) {
      return { accessToken: data.accessToken };
    }

    // refresh token으로 갱신
    if (!data.refreshToken) {
      throw new HttpsError('unauthenticated', 'Reconnect required');
    }

    const tokenRes = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: data.refreshToken,
        client_id: googleOAuthClientId.value(),
        client_secret: googleOAuthClientSecret.value(),
        grant_type: 'refresh_token',
      }),
    });

    if (!tokenRes.ok) {
      // refresh token 만료/취소됨 — 재연결 필요
      await db.doc(`users/${uid}/private/gcal`).update({ connected: false });
      throw new HttpsError('unauthenticated', 'Reconnect required');
    }

    const tokens = await tokenRes.json() as { access_token: string; expires_in: number };
    const newExpiry = Date.now() + (tokens.expires_in - 60) * 1000;

    await db.doc(`users/${uid}/private/gcal`).update({
      accessToken: tokens.access_token,
      expiresAt: newExpiry,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { accessToken: tokens.access_token };
  }
);

// ── 4. 연결 해제 ─────────────────────────────────────────────────────────────

export const gcalDisconnect = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login required');
  const uid = request.auth.uid;
  const db = admin.firestore();
  await db.doc(`users/${uid}/private/gcal`).set({ connected: false }, { merge: true });
  await db.doc(`users/${uid}/settings/app`).set({ gcalConnected: false }, { merge: true });
  return { success: true };
});
