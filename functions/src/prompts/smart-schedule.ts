interface PromptResult { system: string; user: string; }

export function buildSmartSchedulePrompt(context: Record<string, any>, langInstruction: string): PromptResult {
  const { date = '', tasks = [], existingSlots = {}, calendarEvents = [], workStart = '09:00', workEnd = '18:00', userMessage = '' } = context;

  const taskList = tasks.map((t: any) =>
    `- ${t.title} [priority: ${t.priority}]${t.estimatedMinutes ? ` ~${t.estimatedMinutes}min` : ''}`
  ).join('\n') || '없음';

  const eventList = calendarEvents.map((e: any) =>
    `- ${e.startTime ?? '종일'} ${e.title}`
  ).join('\n') || '없음';

  const existingList = Object.entries(existingSlots).map(([time, text]) =>
    `- ${time}: ${text}`
  ).join('\n') || '없음';

  return {
    system: `You are a productivity scheduling assistant. Create an optimal daily schedule for the user based on their tasks and calendar.
${langInstruction}

Work hours: ${workStart} ~ ${workEnd}
If the user requests a specific single slot (e.g., "17:20에 시안작업"), return only that one slot.
Otherwise schedule all tasks in 30-60 minute blocks. Leave breaks. Prioritize urgent/high tasks.

Return ONLY valid JSON (no markdown) in this exact format:
{
  "schedule": [
    { "time": "HH:MM", "task": "task title or activity", "duration": 30 }
  ],
  "advice": "1-2 sentence scheduling tip for today"
}

time must be HH:MM format. duration is in minutes.`,
    user: `${userMessage ? `User request: ${userMessage}\n\n` : ''}Date: ${date}
Tasks to schedule:
${taskList}

Existing calendar events:
${eventList}

Already scheduled in timebox:
${existingList}`,
  };
}
