import * as admin from 'firebase-admin';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { callGemini } from './gemini';
import { buildPrompt, NoahAIAction } from './prompts';
import { getTotalTokensUsed, incrementUsage, getMonthlyUsage } from './usage';
import { getYouTubeVideoInfo } from './youtube';

admin.initializeApp();

const geminiApiKey = defineSecret('GEMINI_API_KEY');
const polarWebhookSecret = defineSecret('POLAR_WEBHOOK_SECRET');
const polarAccessToken = defineSecret('POLAR_ACCESS_TOKEN');
const polarPremiumProductId = defineSecret('POLAR_PREMIUM_PRODUCT_ID');

// ── Polar Webhook ─────────────────────────────────────────────────────────────

export const polarWebhook = onRequest(
  { secrets: [polarWebhookSecret], cors: false },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }

    const rawBody = (req as any).rawBody?.toString() ?? JSON.stringify(req.body);
    const secret = polarWebhookSecret.value();

    if (secret) {
      const signature = (req.headers['webhook-signature'] ?? req.headers['x-polar-signature']) as string | undefined;
      console.log('[polar-webhook] sig header:', signature, 'headers:', JSON.stringify(Object.keys(req.headers)));
      if (!signature) { res.status(401).send('No signature'); return; }

      // Polar signature is raw hex (no prefix)
      const hexSig = signature.replace(/^(sha256=|v1,)/, '');
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
      );
      const sigBytes = Buffer.from(hexSig, 'hex');
      const valid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(rawBody));
      console.log('[polar-webhook] valid:', valid, 'rawBody length:', rawBody.length);
      if (!valid) { res.status(401).send('Invalid signature'); return; }
    }

    const { type, data } = req.body as { type: string; data: Record<string, unknown> };
    const uid = (data?.metadata as Record<string, string>)?.uid;

    if (uid) {
      const db = admin.firestore();
      const ref = db.doc(`users/${uid}/settings/app`);
      if (type === 'order.created' || type === 'subscription.created' || type === 'subscription.active') {
        await ref.set({ plan: 'pro' }, { merge: true });
        console.log(`[polar] plan→pro uid=${uid}`);
      } else if (type === 'subscription.canceled' || type === 'subscription.revoked') {
        await ref.set({ plan: 'free' }, { merge: true });
        console.log(`[polar] plan→free uid=${uid}`);
      }
    }

    res.json({ received: true });
  }
);

// ── Polar Verify Payment ──────────────────────────────────────────────────────

export const verifyPolarPayment = onCall(
  { secrets: [polarAccessToken] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { customerSessionToken } = request.data as { customerSessionToken: string };
    if (!customerSessionToken) {
      throw new HttpsError('invalid-argument', 'customerSessionToken required');
    }

    // Customer session token is used as Bearer to access /v1/customers/me
    const res = await fetch('https://api.polar.sh/v1/customers/me', {
      headers: { Authorization: `Bearer ${customerSessionToken}` },
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[polar-verify] customers/me failed:', res.status, err);
      throw new HttpsError('internal', `Verification failed: ${res.status}`);
    }

    const customer = await res.json();
    console.log('[polar-verify] active_subscriptions:', customer.active_subscriptions?.length, 'email:', customer.email);

    const hasActive = Array.isArray(customer.active_subscriptions) && customer.active_subscriptions.length > 0;
    if (!hasActive) {
      throw new HttpsError('failed-precondition', 'No active subscription found');
    }

    const db = admin.firestore();
    await db.doc(`users/${request.auth.uid}/settings/app`).set({ plan: 'pro' }, { merge: true });
    console.log(`[polar-verify] plan→pro uid=${request.auth.uid}`);

    return { success: true };
  }
);

// ── Polar Checkout ───────────────────────────────────────────────────────────

export const createPolarCheckout = onCall(
  { secrets: [polarAccessToken, polarPremiumProductId] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const token = polarAccessToken.value();
    const productId = polarPremiumProductId.value();

    console.log('[polar] token set:', !!token, 'productId set:', !!productId);

    if (!productId) {
      throw new HttpsError('failed-precondition', 'POLAR_PREMIUM_PRODUCT_ID secret not configured');
    }
    if (!token) {
      throw new HttpsError('failed-precondition', 'POLAR_ACCESS_TOKEN secret not configured');
    }

    const body: Record<string, unknown> = {
      products: [productId],
      success_url: 'https://ai-todo-e213a.web.app/payment/success',
      metadata: { uid: request.auth.uid },
    };
    if (request.auth.token.email) {
      body.customer_email = request.auth.token.email;
    }

    const res = await fetch('https://api.polar.sh/v1/checkouts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[polar] checkout failed:', res.status, errText);
      throw new HttpsError('internal', `Polar API error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    return { url: data.url };
  }
);

// Token limits per plan
const TOKEN_LIMITS: Record<string, number> = {
  free: 0,
  premium: 500000,
  team: 2000000,
};

interface CallNoahAIRequest {
  action: NoahAIAction;
  context: Record<string, any>;
  language: string;
}

export const callNoahAI = onCall(
  {
    secrets: [geminiApiKey],
    maxInstances: 10,
    timeoutSeconds: 120,
    memory: '512MiB',
  },
  async (request) => {
    // 1. Auth check
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const uid = request.auth.uid;
    const { action, context, language } = request.data as CallNoahAIRequest;

    if (!action) {
      throw new HttpsError('invalid-argument', 'Action is required');
    }

    // 2. Get user settings to check plan
    const db = admin.firestore();
    const settingsDoc = await db.collection('users').doc(uid).collection('settings').doc('app').get();
    const settings = settingsDoc.data() || {};
    const plan = settings.plan || 'free';
    const isAdmin = settings.isAdmin === true;

    // 3. Plan check (free users cannot use AI)
    if (plan === 'free' && !isAdmin) {
      throw new HttpsError('permission-denied', 'AI features require Premium or Team plan');
    }

    // 4. Token limit check
    if (!isAdmin) {
      const totalUsed = await getTotalTokensUsed(uid);
      const limit = TOKEN_LIMITS[plan] || 0;

      if (limit > 0 && totalUsed >= limit) {
        throw new HttpsError('resource-exhausted', 'Monthly AI token limit reached');
      }
    }

    // 5. Handle YouTube video info fetching if needed
    let processedContext = { ...context };
    if ((action === 'youtube_to_note' || action === 'youtube_to_mindmap') && context.url) {
      try {
        const videoInfo = await getYouTubeVideoInfo(context.url);
        processedContext.hasTranscript = videoInfo.hasTranscript;
        if (videoInfo.hasTranscript && videoInfo.transcript) {
          processedContext.transcript = videoInfo.transcript;
        }
        if (videoInfo.metadata) {
          processedContext.videoTitle = videoInfo.metadata.title || context.videoTitle || '';
          processedContext.videoAuthor = videoInfo.metadata.author || '';
          processedContext.videoDescription = videoInfo.metadata.description || '';
        }
      } catch (error: any) {
        throw new HttpsError('failed-precondition', error.message || 'Failed to fetch YouTube video info');
      }
    }

    // 6. Build prompt and call Gemini
    try {
      const { system, user } = buildPrompt(action, processedContext, language || 'ko');
      const geminiResult = await callGemini(system, user, true);

      // 7. Track token usage
      await incrementUsage(uid, geminiResult.inputTokens, geminiResult.outputTokens);

      // 8. Get updated usage for response
      const usage = await getMonthlyUsage(uid);
      const totalUsed = usage.totalInputTokens + usage.totalOutputTokens;
      const limit = isAdmin ? -1 : (TOKEN_LIMITS[plan] || 0);

      // 9. Parse and return structured response
      let parsedResult;
      try {
        parsedResult = JSON.parse(geminiResult.text);
      } catch {
        parsedResult = { text: geminiResult.text };
      }

      return {
        result: parsedResult,
        tokensUsed: {
          input: geminiResult.inputTokens,
          output: geminiResult.outputTokens,
        },
        monthlyUsage: {
          used: totalUsed,
          limit: limit,
        },
      };
    } catch (error: any) {
      if (error instanceof HttpsError) throw error;
      console.error('Gemini API error:', error);
      throw new HttpsError('internal', 'AI processing failed. Please try again.');
    }
  }
);
