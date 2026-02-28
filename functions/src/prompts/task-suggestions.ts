interface PromptResult {
  system: string;
  user: string;
}

/**
 * Suggest tasks based on current context (My Day, all tasks)
 */
export function buildTaskSuggestionsPrompt(context: Record<string, any>, langInstruction: string): PromptResult {
  const tasks = JSON.stringify(context.tasks || []);

  return {
    system: `You are Noah AI, a productivity assistant. ${langInstruction} Return JSON.`,
    user: `Based on these tasks, suggest 3-5 new tasks the user might need. Return {"suggestions": [{"title": string, "priority": "urgent"|"high"|"medium"|"low", "reason": string}]}.

Tasks: ${tasks}`,
  };
}

/**
 * Prioritize existing tasks
 */
export function buildPrioritizePrompt(context: Record<string, any>, langInstruction: string): PromptResult {
  const tasks = JSON.stringify(context.tasks || []);

  return {
    system: `You are Noah AI, a productivity assistant. ${langInstruction} Return JSON.`,
    user: `Analyze and prioritize these tasks. Consider deadlines, urgency, and dependencies. Return {"priorities": [{"taskId": string, "suggestedPriority": "urgent"|"high"|"medium"|"low", "score": number, "reason": string}]}.

Tasks: ${tasks}`,
  };
}

/**
 * Suggest optimal schedule for tasks
 */
export function buildSchedulePrompt(context: Record<string, any>, langInstruction: string): PromptResult {
  const tasks = JSON.stringify(context.tasks || []);
  const today = new Date().toISOString().split('T')[0];

  return {
    system: `You are Noah AI, a scheduling assistant. ${langInstruction} Return JSON. Today is ${today}.`,
    user: `Suggest an optimal schedule for these tasks over the next 7 days. Return {"schedule": [{"taskId": string, "suggestedDate": string, "timeSlot": "morning"|"afternoon"|"evening", "reason": string}]}.

Tasks: ${tasks}`,
  };
}

/**
 * Break down a task into subtasks
 */
export function buildBreakdownPrompt(context: Record<string, any>, langInstruction: string): PromptResult {
  const task = context.task || {};

  return {
    system: `You are Noah AI, a productivity assistant. ${langInstruction} Return JSON.`,
    user: `Break down this task into 3-7 concrete subtasks. Return {"subtasks": [{"title": string, "estimatedMinutes": number}]}.

Task: "${task.title}"${task.memo ? `\nDetails: ${task.memo}` : ''}`,
  };
}
