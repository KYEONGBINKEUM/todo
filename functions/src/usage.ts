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

function getCurrentMonthKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Get current month's AI usage for a user
 */
export async function getMonthlyUsage(uid: string): Promise<AIUsage> {
  const monthKey = getCurrentMonthKey();
  const docRef = getDb().collection('users').doc(uid).collection('ai_usage').doc(monthKey);
  const snapshot = await docRef.get();

  if (!snapshot.exists) {
    return { totalInputTokens: 0, totalOutputTokens: 0, requestCount: 0, lastRequestAt: admin.firestore.Timestamp.now() };
  }

  return snapshot.data() as AIUsage;
}

/**
 * Increment token usage atomically
 */
export async function incrementUsage(uid: string, inputTokens: number, outputTokens: number): Promise<void> {
  const monthKey = getCurrentMonthKey();
  const docRef = getDb().collection('users').doc(uid).collection('ai_usage').doc(monthKey);

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
 * Get total tokens used this month
 */
export async function getTotalTokensUsed(uid: string): Promise<number> {
  const usage = await getMonthlyUsage(uid);
  return usage.totalInputTokens + usage.totalOutputTokens;
}
