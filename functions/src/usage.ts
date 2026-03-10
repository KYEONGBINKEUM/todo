import * as admin from 'firebase-admin';

function getDb() {
  return admin.firestore();
}

interface AIUsage {
  totalInputTokens: number;
  totalOutputTokens: number;
  requestCount: number;
  lastRequestAt: admin.firestore.Timestamp;
}

/**
 * Compute the current billing cycle key based on subscription start date.
 * Key format: YYYY-MM-DD (the start of the current billing period).
 * If no planStartedAt, falls back to calendar month (YYYY-MM).
 */
export function getBillingCycleKey(planStartedAt?: string): string {
  const now = new Date();

  if (!planStartedAt) {
    // Fallback: calendar month
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  const anchorDay = new Date(planStartedAt).getDate();
  let cycleYear = now.getFullYear();
  let cycleMonth = now.getMonth(); // 0-indexed

  // If today is before the anchor day, the billing cycle started last month
  if (now.getDate() < anchorDay) {
    cycleMonth -= 1;
    if (cycleMonth < 0) {
      cycleMonth = 11;
      cycleYear -= 1;
    }
  }

  const day = String(anchorDay).padStart(2, '0');
  const month = String(cycleMonth + 1).padStart(2, '0');
  return `${cycleYear}-${month}-${day}`;
}

/**
 * Get current billing cycle's AI usage for a user
 */
export async function getMonthlyUsage(uid: string, planStartedAt?: string): Promise<AIUsage> {
  const cycleKey = getBillingCycleKey(planStartedAt);
  const docRef = getDb().collection('users').doc(uid).collection('ai_usage').doc(cycleKey);
  const snapshot = await docRef.get();

  if (!snapshot.exists) {
    return { totalInputTokens: 0, totalOutputTokens: 0, requestCount: 0, lastRequestAt: admin.firestore.Timestamp.now() };
  }

  return snapshot.data() as AIUsage;
}

/**
 * Increment token usage atomically
 */
export async function incrementUsage(uid: string, inputTokens: number, outputTokens: number, planStartedAt?: string): Promise<void> {
  const cycleKey = getBillingCycleKey(planStartedAt);
  const docRef = getDb().collection('users').doc(uid).collection('ai_usage').doc(cycleKey);

  await docRef.set(
    {
      totalInputTokens: admin.firestore.FieldValue.increment(inputTokens),
      totalOutputTokens: admin.firestore.FieldValue.increment(outputTokens),
      requestCount: admin.firestore.FieldValue.increment(1),
      lastRequestAt: admin.firestore.Timestamp.now(),
    },
    { merge: true }
  );
}

/**
 * Get total tokens used in the current billing cycle
 */
export async function getTotalTokensUsed(uid: string, planStartedAt?: string): Promise<number> {
  const usage = await getMonthlyUsage(uid, planStartedAt);
  return usage.totalInputTokens + usage.totalOutputTokens;
}
