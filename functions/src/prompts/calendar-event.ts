interface PromptResult {
  system: string;
  user: string;
}

/**
 * Calendar event extraction prompt
 * Parses user's natural language into structured event data
 */
export function buildCalendarEventPrompt(context: Record<string, any>, langInstruction: string): PromptResult {
  const today = context.today || new Date().toISOString().slice(0, 10);
  const userMessage = context.userMessage || '';

  return {
    system: `You are a calendar assistant. Extract event information from the user's message and return it as JSON.
Today's date is ${today}.

${langInstruction}

For a SINGLE date, return:
{ "title": "...", "date": "YYYY-MM-DD", "startTime": "HH:MM or null", "endTime": "HH:MM or null", "allDay": true/false }

For a DATE RANGE (e.g. "3월 30일~4월 5일", "이번 주 내내"), return:
{ "events": [ { "title": "...", "date": "YYYY-MM-DD", "startTime": null, "endTime": null, "allDay": true }, ... ] }
Include ALL dates in the range as separate objects.

Return ONLY valid JSON — no markdown, no explanation.

Rules:
- Parse relative dates: 오늘/today → ${today}, 내일/tomorrow → next day, 이번 주 → Mon-Sun of this week
- Parse Korean dates like "4월 4일" → current year's month + day
- Range formats: "A~B", "A부터 B까지", "A에서 B까지"
- If no time is specified, allDay = true, startTime/endTime = null
- If only start time given, endTime = startTime + 1 hour
- title = event name only (no date/time info)
- All dates in YYYY-MM-DD format, times in HH:MM 24h format`,
    user: userMessage,
  };
}
