import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { callGemini } from './gemini';
import { buildPrompt, NoahAIAction } from './prompts';
import { getTotalTokensUsed, incrementUsage, getMonthlyUsage } from './usage';
import { getYouTubeTranscript } from './youtube';

admin.initializeApp();

const geminiApiKey = defineSecret('GEMINI_API_KEY');

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

    // 5. Handle YouTube transcript fetching if needed
    let processedContext = { ...context };
    if ((action === 'youtube_to_note' || action === 'youtube_to_mindmap') && context.url) {
      try {
        const transcript = await getYouTubeTranscript(context.url);
        processedContext.transcript = transcript;
      } catch (error: any) {
        throw new HttpsError('failed-precondition', error.message || 'Failed to fetch YouTube transcript');
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
