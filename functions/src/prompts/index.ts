import { buildTaskSuggestionsPrompt, buildPrioritizePrompt, buildSchedulePrompt, buildBreakdownPrompt } from './task-suggestions';
import { buildNoteWriterPrompt } from './note-writer';
import { buildNoteCompleterPrompt } from './note-completer';
import { buildYouTubeToNotePrompt, buildYouTubeToMindmapPrompt } from './youtube-analyzer';
import { buildMindmapGeneratorPrompt } from './mindmap-generator';

export type NoahAIAction =
  | 'suggest_tasks'
  | 'prioritize'
  | 'schedule'
  | 'breakdown'
  | 'auto_write_note'
  | 'complete_note'
  | 'youtube_to_note'
  | 'youtube_to_mindmap'
  | 'generate_mindmap';

interface PromptResult {
  system: string;
  user: string;
}

/**
 * Build system + user prompts for a given action and context.
 * Language is passed so Gemini responds in the user's language.
 */
export function buildPrompt(action: NoahAIAction, context: Record<string, any>, language: string): PromptResult {
  const langInstruction = getLanguageInstruction(language);

  switch (action) {
    case 'suggest_tasks':
      return buildTaskSuggestionsPrompt(context, langInstruction);
    case 'prioritize':
      return buildPrioritizePrompt(context, langInstruction);
    case 'schedule':
      return buildSchedulePrompt(context, langInstruction);
    case 'breakdown':
      return buildBreakdownPrompt(context, langInstruction);
    case 'auto_write_note':
      return buildNoteWriterPrompt(context, langInstruction);
    case 'complete_note':
      return buildNoteCompleterPrompt(context, langInstruction);
    case 'youtube_to_note':
      return buildYouTubeToNotePrompt(context, langInstruction);
    case 'youtube_to_mindmap':
      return buildYouTubeToMindmapPrompt(context, langInstruction);
    case 'generate_mindmap':
      return buildMindmapGeneratorPrompt(context, langInstruction);
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

function getLanguageInstruction(lang: string): string {
  const langMap: Record<string, string> = {
    ko: '한국어로 응답하세요.',
    en: 'Respond in English.',
    ja: '日本語で回答してください。',
    es: 'Responde en español.',
    pt: 'Responda em português.',
    fr: 'Répondez en français.',
  };
  return langMap[lang] || langMap.ko;
}
