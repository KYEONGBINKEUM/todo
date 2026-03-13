interface PromptResult {
  system: string;
  user: string;
}

function getPageDisplayName(pathname: string, lang: string): string {
  const pageNames: Record<string, Record<string, string>> = {
    '/my-day': { ko: '오늘의 할 일', en: 'My Day', ja: '今日のタスク', es: 'Mi Día', pt: 'Meu Dia', fr: 'Ma Journée' },
    '/tasks': { ko: '모든 작업', en: 'All Tasks', ja: 'すべてのタスク', es: 'Todas las Tareas', pt: 'Todas as Tarefas', fr: 'Toutes les Tâches' },
    '/upcoming': { ko: '예정된 작업', en: 'Upcoming', ja: '予定', es: 'Próximas', pt: 'Próximas', fr: 'À Venir' },
    '/notes': { ko: '노트', en: 'Notes', ja: 'ノート', es: 'Notas', pt: 'Notas', fr: 'Notes' },
    '/mindmap': { ko: '마인드맵', en: 'Mind Map', ja: 'マインドマップ', es: 'Mapa Mental', pt: 'Mapa Mental', fr: 'Carte Mentale' },
    '/important': { ko: '중요', en: 'Important', ja: '重要', es: 'Importante', pt: 'Importante', fr: 'Important' },
    '/shared': { ko: '공유됨', en: 'Shared', ja: '共有', es: 'Compartido', pt: 'Compartilhado', fr: 'Partagé' },
  };
  const names = pageNames[pathname];
  if (!names) return pathname;
  return names[lang] || names['en'] || pathname;
}

/**
 * General chat prompt - responds naturally like a conversational AI
 */
export function buildChatPrompt(context: Record<string, any>, langInstruction: string, language: string = 'ko'): PromptResult {
  const userInput = context.userMessage ?? context.__userText ?? context.userInput ?? '';
  const currentPage = context.currentPage || '';
  const pageName = getPageDisplayName(currentPage, language);

  // Calendar page: inject event data so AI can answer schedule questions
  let calendarContext = '';
  if (currentPage === '/calendar') {
    const today = context.today || '';
    const allEvents: any[] = context.allEvents || [];
    const todayEvents: any[] = context.todayEvents || [];

    if (allEvents.length > 0) {
      const eventLines = allEvents
        .map((e: any) => `  - ${e.date}${e.startTime ? ' ' + e.startTime : ''}: ${e.title}`)
        .join('\n');
      calendarContext = `\nToday is ${today}. The user's upcoming calendar events:\n${eventLines}\n
IMPORTANT: You have full access to the user's schedule listed above. Answer questions about specific dates by checking the list. If asked to ADD an event, say "일정을 추가하려면 '[일정명] 일정 추가해줘'라고 입력해 주세요" — do NOT claim you added it.`;
    } else {
      calendarContext = `\nToday is ${today}. The user currently has no upcoming events in their calendar.
If asked to ADD an event, say "일정을 추가하려면 '[일정명] 일정 추가해줘'라고 입력해 주세요" — do NOT claim you added it.`;
    }
  }

  // Notes page: inject note content + YouTube guidance
  let notesContext = '';
  if (currentPage === '/notes') {
    const noteTitle = context.title || '';
    const noteBlocks: any[] = context.blocks || [];
    if (noteTitle || noteBlocks.length > 0) {
      const noteContent = noteBlocks.map((b: any) => b.content).filter(Boolean).join('\n').slice(0, 1000);
      notesContext = `\nCurrent note: "${noteTitle}"\nContent preview:\n${noteContent || '(empty)'}\n
You can answer questions about this note. If the user pastes a YouTube URL, tell them it will be converted to a note automatically. If they ask to "요약해줘/summarize" without a URL, say "유튜브 링크를 입력창에 붙여넣으시면 바로 노트로 요약해드려요!".`;
    } else {
      notesContext = `\nThe user is on the Notes page with no note selected. If they ask about summarizing YouTube videos, say "유튜브 링크를 입력창에 붙여넣으시면 노트로 요약해드려요!" — do NOT say you cannot summarize.`;
    }
  }

  // Timebox page: inject slot data
  let timeboxContext = '';
  if (currentPage === '/timebox') {
    const slots: Record<string, string> = context.slots || {};
    const filledSlots = Object.entries(slots).filter(([, v]) => v).map(([t, v]) => `  - ${t}: ${v}`).join('\n');
    if (filledSlots) {
      timeboxContext = `\nToday's timebox schedule:\n${filledSlots}\n`;
    }
    timeboxContext += `\nIMPORTANT: If the user asks you to fill/add/schedule timebox slots, say "타임박스에 일정을 추가하려면 '오늘 일정 짜줘' 또는 구체적인 시간대를 포함해 입력해 주세요" — do NOT claim you added it.`;
  }

  return {
    system: `You are Noah AI (노아AI), a friendly and helpful AI assistant embedded in a productivity app called "NOAH".
${langInstruction}
Return JSON with format: {"reply": "your response here"}

Guidelines:
- Be conversational, warm, and natural - like chatting with a helpful friend
- You can discuss any topic the user brings up
- If the user asks about productivity, tasks, or notes, give practical advice
- Keep responses concise but helpful (2-5 sentences typically)
- Use appropriate tone - casual for casual questions, detailed for complex ones
- You can use markdown formatting in your reply (bold, lists, etc.)
- The user is currently on the "${pageName}" page of the app${calendarContext}${notesContext}${timeboxContext}

CRITICAL — NEVER HALLUCINATE UI:
- NEVER describe UI buttons, menus, or steps (e.g. "길게 누르거나", "편집 버튼을 눌러", "설정에서") — you do not know the app's UI
- If the user wants to DELETE a calendar event, say exactly: "'[일정명] 삭제해줘' 또는 '내일 일정 모두 삭제해줘'라고 입력하시면 AI가 직접 실행해드릴 수 있어요."
- If the user wants to do something you cannot perform as chat, tell them the exact command phrase to use instead
- NEVER claim you performed an action you did not actually perform`,
    user: userInput,
  };
}
