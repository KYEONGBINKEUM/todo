import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import type { NoahAIAction } from './noah-ai-context';

export interface NoahAIResponse {
  result: any;
  tokensUsed: { input: number; output: number };
  monthlyUsage: { used: number; limit: number };
}

const callNoahAIFn = httpsCallable<
  { action: NoahAIAction; context: Record<string, any>; language: string },
  NoahAIResponse
>(functions, 'callNoahAI');

/**
 * Call Noah AI Cloud Function with the given action and context.
 * Handles Firebase callable function wrapper.
 */
export async function callNoahAI(
  action: NoahAIAction,
  context: Record<string, any>,
  language: string
): Promise<NoahAIResponse> {
  const result = await callNoahAIFn({ action, context, language });
  return result.data;
}

/**
 * Detect if a string contains a YouTube URL
 */
export function detectYouTubeURL(text: string): string | null {
  const match = text.match(
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/
  );
  return match ? match[0] : null;
}

/**
 * Check if a YouTube URL is valid
 */
export function isYouTubeURL(url: string): boolean {
  return detectYouTubeURL(url) !== null;
}
