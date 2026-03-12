interface PromptResult { system: string; user: string; }

export function buildExtractTasksPrompt(context: Record<string, any>, langInstruction: string): PromptResult {
  const { text = '' } = context;

  return {
    system: `You are a task extraction assistant. Extract actionable tasks from the given text (meeting notes, documents, articles, etc.).
${langInstruction}

Return ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "tasks": [
    { "title": "clear action item", "priority": "urgent|high|medium|low", "dueDate": "YYYY-MM-DD or null" }
  ],
  "summary": "1 sentence description of the source document"
}

Rules:
- Extract only concrete, actionable items (not vague statements)
- title should be concise (under 60 chars) and start with a verb
- priority: urgent if deadline mentioned, high if important, medium by default, low if optional
- dueDate: parse if mentioned, otherwise null
- Maximum 20 tasks`,
    user: text,
  };
}
