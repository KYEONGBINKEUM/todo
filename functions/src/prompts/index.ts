import { buildTaskSuggestionsPrompt, buildPrioritizePrompt, buildSchedulePrompt, buildBreakdownPrompt } from './task-suggestions';
import { buildNoteWriterPrompt } from './note-writer';
import { buildNoteCompleterPrompt } from './note-completer';
import { buildYouTubeToNotePrompt, buildYouTubeToMindmapPrompt } from './youtube-analyzer';
import { buildMindmapGeneratorPrompt } from './mindmap-generator';
import { buildChatPrompt } from './chat';
import { buildCalendarEventPrompt } from './calendar-event';
import { buildCalendarUpdatePrompt } from './calendar-update';
import { buildCalendarDeletePrompt } from './calendar-delete';
import { buildWeeklyReviewPrompt } from './weekly-review';
import { buildSmartSchedulePrompt } from './smart-schedule';
import { buildExtractTasksPrompt } from './extract-tasks';

export type NoahAIAction =
  | 'chat'
  | 'suggest_tasks'
  | 'prioritize'
  | 'schedule'
  | 'breakdown'
  | 'auto_write_note'
  | 'complete_note'
  | 'youtube_to_note'
  | 'youtube_to_mindmap'
  | 'generate_mindmap'
  | 'calendar_add_event'
  | 'calendar_update_event'
  | 'calendar_delete_events'
  | 'weekly_review'
  | 'smart_schedule'
  | 'extract_tasks';

interface PromptResult {
  system: string;
  user: string;
}

export function buildPrompt(action: NoahAIAction, context: Record<string, any>, language: string): PromptResult {
  const langInstruction = getLanguageInstruction(language);

  switch (action) {
    case 'chat':
      return buildChatPrompt(context, langInstruction, language);
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
    case 'calendar_add_event':
      return buildCalendarEventPrompt(context, langInstruction);
    case 'calendar_update_event':
      return buildCalendarUpdatePrompt(context, langInstruction);
    case 'calendar_delete_events':
      return buildCalendarDeletePrompt(context, langInstruction);
    case 'weekly_review':
      return buildWeeklyReviewPrompt(context, langInstruction);
    case 'smart_schedule':
      return buildSmartSchedulePrompt(context, langInstruction);
    case 'extract_tasks':
      return buildExtractTasksPrompt(context, langInstruction);
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
