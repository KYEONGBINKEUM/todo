interface PromptResult { system: string; user: string; }

export function buildCalendarUpdatePrompt(context: Record<string, any>, langInstruction: string): PromptResult {
  const today = context.today || new Date().toISOString().slice(0, 10);
  const userMessage = context.userMessage || '';
  const events: any[] = context.existingEvents || [];

  const eventList = events.length > 0
    ? events.map((e: any) =>
        `- id:${e.id} | "${e.title}" | ${e.date}${e.startTime ? ' ' + e.startTime : ''}${e.endTime ? '~' + e.endTime : ''}`
      ).join('\n')
    : '(없음)';

  return {
    system: `You are a calendar assistant. The user wants to update an existing calendar event.
Today is ${today}.
${langInstruction}

Existing events:
${eventList}

Find the best matching event from the list above and return ONLY valid JSON (no markdown):
{
  "targetId": "event id from the list",
  "targetTitle": "matched event title",
  "newDate": "YYYY-MM-DD or null",
  "newStartTime": "HH:MM or null",
  "newEndTime": "HH:MM or null",
  "newTitle": "new title or null",
  "newAllDay": true or false
}

Rules:
- targetId MUST be from the existing events list above
- Set newAllDay to false if start/end times are specified
- If the user doesn't mention changing a field, set it to null
- Parse Korean time: 오후 3시 30분 → 15:30, 오전 10시 → 10:00
- Parse Korean dates: 내일 → next day from today, 모레 → day after tomorrow
- Parse relative dates correctly based on today=${today}`,
    user: userMessage,
  };
}
