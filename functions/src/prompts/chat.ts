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
  const userInput = context.userInput || '';
  const currentPage = context.currentPage || '';
  const pageName = getPageDisplayName(currentPage, language);

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
- The user is currently on the "${pageName}" page of the app`,
    user: userInput,
  };
}
