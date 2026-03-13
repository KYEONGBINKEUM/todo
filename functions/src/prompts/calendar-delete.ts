interface PromptResult { system: string; user: string; }

export function buildCalendarDeletePrompt(context: Record<string, any>, langInstruction: string): PromptResult {
  const today = context.today || new Date().toISOString().slice(0, 10);
  const userMessage = context.userMessage || '';
  const events: any[] = context.existingEvents || [];

  const tomorrow = (() => {
    const d = new Date(today + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  const eventList = events.length > 0
    ? events.map((e: any) =>
        `- id:${e.id} | "${e.title}" | ${e.date}${e.startTime ? ' ' + e.startTime : ''}${e.endTime ? '~' + e.endTime : ''}`
      ).join('\n')
    : '(없음)';

  return {
    system: `You are a calendar assistant. The user wants to delete one or more calendar events.
Today is ${today}. Tomorrow is ${tomorrow}.
${langInstruction}

Existing events:
${eventList}

Find ALL events matching the user's request and return ONLY valid JSON (no markdown):
{
  "targetIds": ["event id 1", "event id 2"],
  "targetTitles": ["event title 1", "event title 2"]
}

Rules:
- targetIds MUST be ids from the existing events list above
- "내일" = ${tomorrow}, "오늘" = ${today}
- "모든" / "전체" / "다" = all events on that date or matching criteria
- If no matching events found, return { "targetIds": [], "targetTitles": [] }
- Parse Korean: 내일 → ${tomorrow}, 모레 → day after tomorrow`,
    user: userMessage,
  };
}
