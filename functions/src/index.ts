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

    const uid = request.auth.uid;
    const token = polarAccessToken.value();

    // Orders filtered by metadata[uid] set during checkout creation
    const ordRes = await fetch(
      `https://api.polar.sh/v1/orders?metadata[uid]=${encodeURIComponent(uid)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!ordRes.ok) {
      const err = await ordRes.text();
      console.error('[polar-verify] orders failed:', ordRes.status, err);
      throw new HttpsError('internal', `Verification failed: ${ordRes.status}`);
    }

    const ordData = await ordRes.json();
    console.log('[polar-verify] orders by uid:', ordData.items?.length);

    let hasPayment = (ordData.items?.length ?? 0) > 0;

    // Fallback: check subscriptions by metadata[uid]
    let periodEnd: string | null = null;
    if (!hasPayment) {
      const subRes = await fetch(
        `https://api.polar.sh/v1/subscriptions?metadata[uid]=${encodeURIComponent(uid)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (subRes.ok) {
        const subData = await subRes.json();
        console.log('[polar-verify] subscriptions by uid:', subData.items?.length);
        hasPayment = (subData.items?.length ?? 0) > 0;
        periodEnd = subData.items?.[0]?.current_period_end ?? null;
      }
    } else {
      // Get period end from subscription linked to the order
      const subRes = await fetch(
        `https://api.polar.sh/v1/subscriptions?metadata[uid]=${encodeURIComponent(uid)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (subRes.ok) {
        const subData = await subRes.json();
        periodEnd = subData.items?.[0]?.current_period_end ?? null;
      }
    }

    if (!hasPayment) {
      throw new HttpsError('failed-precondition', 'No subscription or order found for this account');
    }

    const db = admin.firestore();
    await db.doc(`users/${request.auth.uid}/settings/app`).set({
      plan: 'pro',
      ...(periodEnd ? { planCurrentPeriodEnd: periodEnd } : {}),
    }, { merge: true });
    console.log(`[polar-verify] plan→pro uid=${request.auth.uid} periodEnd=${periodEnd}`);

    return { success: true };
  }
);

// ── Polar Cancel Subscription ────────────────────────────────────────────────

export const cancelPolarSubscription = onCall(
  { secrets: [polarAccessToken] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const uid = request.auth.uid;
    const token = polarAccessToken.value();

    // Find subscription by metadata uid
    const subRes = await fetch(
      `https://api.polar.sh/v1/subscriptions?metadata[uid]=${encodeURIComponent(uid)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!subRes.ok) {
      const err = await subRes.text();
      console.error('[polar-cancel] fetch subscriptions failed:', subRes.status, err);
      throw new HttpsError('internal', `Failed to fetch subscriptions: ${subRes.status}`);
    }

    const subData = await subRes.json();
    const subscription = subData.items?.find((s: any) => s.status === 'active');

    if (!subscription) {
      throw new HttpsError('not-found', 'No active subscription found');
    }

    // Cancel at period end (PATCH with cancel_at_period_end: true)
    const cancelRes = await fetch(`https://api.polar.sh/v1/subscriptions/${subscription.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cancel_at_period_end: true }),
    });

    if (!cancelRes.ok) {
      const err = await cancelRes.text();
      console.error('[polar-cancel] cancel failed:', cancelRes.status, err);
      throw new HttpsError('internal', `Failed to cancel subscription: ${cancelRes.status}`);
    }

    const cancelData = await cancelRes.json();
    const periodEnd = cancelData.current_period_end ?? subscription.current_period_end;

    // Update Firestore: mark as canceling (still pro until period end)
    const db = admin.firestore();
    await db.doc(`users/${uid}/settings/app`).set({
      planCancelAtPeriodEnd: true,
      planCurrentPeriodEnd: periodEnd,
    }, { merge: true });

    console.log(`[polar-cancel] scheduled cancel uid=${uid} periodEnd=${periodEnd}`);
    return { success: true, periodEnd };
  }
);

// ── Polar Reactivate Subscription ────────────────────────────────────────────

export const reactivatePolarSubscription = onCall(
  { secrets: [polarAccessToken] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const uid = request.auth.uid;
    const token = polarAccessToken.value();

    const subRes = await fetch(
      `https://api.polar.sh/v1/subscriptions?metadata[uid]=${encodeURIComponent(uid)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!subRes.ok) {
      throw new HttpsError('internal', `Failed to fetch subscriptions: ${subRes.status}`);
    }

    const subData = await subRes.json();
    const subscription = subData.items?.find((s: any) => s.cancel_at_period_end === true);

    if (!subscription) {
      throw new HttpsError('not-found', 'No canceling subscription found');
    }

    const reactRes = await fetch(`https://api.polar.sh/v1/subscriptions/${subscription.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cancel_at_period_end: false }),
    });

    if (!reactRes.ok) {
      const err = await reactRes.text();
      console.error('[polar-reactivate] failed:', reactRes.status, err);
      throw new HttpsError('internal', `Failed to reactivate: ${reactRes.status}`);
    }

    const db = admin.firestore();
    await db.doc(`users/${uid}/settings/app`).set({
      planCancelAtPeriodEnd: false,
      planCurrentPeriodEnd: subscription.current_period_end,
    }, { merge: true });

    console.log(`[polar-reactivate] reactivated uid=${uid}`);
    return { success: true };
  }
);

// ── Polar Portal URL ─────────────────────────────────────────────────────────

export const getPolarPortalUrl = onCall(
  { secrets: [polarAccessToken] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const token = polarAccessToken.value();

    // Get organization info to retrieve slug
    const res = await fetch('https://api.polar.sh/v1/organizations/', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new HttpsError('internal', `Failed to get org info: ${res.status}`);
    }

    const data = await res.json();
    const org = data.items?.[0];
    if (!org?.slug) {
      throw new HttpsError('not-found', 'Organization not found');
    }

    return { url: `https://polar.sh/${org.slug}/portal` };
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
  pro: 500000,
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
