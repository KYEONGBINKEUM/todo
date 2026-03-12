interface PromptResult { system: string; user: string; }

export function buildWeeklyReviewPrompt(context: Record<string, any>, langInstruction: string): PromptResult {
  const { completedTasks = [], pendingTasks = [], weekRange = '', totalPomodoros = 0 } = context;

  const completedList = completedTasks.map((t: any) =>
    `- ${t.title}${t.priority ? ` [${t.priority}]` : ''}${t.completedDate ? ` (${t.completedDate})` : ''}`
  ).join('\n') || '없음';

  const pendingList = pendingTasks.slice(0, 10).map((t: any) =>
    `- ${t.title}${t.priority ? ` [${t.priority}]` : ''}`
  ).join('\n') || '없음';

  return {
    system: `You are a productivity coach. Analyze the user's weekly tasks and generate a structured weekly review report.
${langInstruction}

Return ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "summary": "2-3 sentence overall summary of the week",
  "achievements": ["achievement 1", "achievement 2", "achievement 3"],
  "patterns": ["pattern or insight 1", "pattern or insight 2"],
  "nextWeekPlan": ["recommended action 1", "recommended action 2", "recommended action 3"],
  "motivationalMessage": "1 sentence encouragement"
}`,
    user: `Week: ${weekRange}
Completed tasks (${completedTasks.length}):
${completedList}

Pending tasks (${pendingTasks.length}):
${pendingList}

Focus sessions this week: ${totalPomodoros}`,
  };
}
