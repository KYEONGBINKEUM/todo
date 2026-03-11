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

Return ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "title": "event title",
  "date": "YYYY-MM-DD",
  "startTime": "HH:MM or null",
  "endTime": "HH:MM or null",
  "allDay": true or false
}

Rules:
- Parse relative dates: 오늘/today → ${today}, 내일/tomorrow → next day, etc.
- Parse Korean dates like "4월 4일" → current year + month + day
- If no time is specified, set allDay to true and startTime/endTime to null
- If only start time is given, set endTime to startTime + 1 hour
- title should be the event name without date/time info
- date must be in YYYY-MM-DD format
- startTime and endTime must be in HH:MM 24-hour format or null`,
    user: userMessage,
  };
}
