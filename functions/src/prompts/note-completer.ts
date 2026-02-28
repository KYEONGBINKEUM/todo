interface PromptResult {
  system: string;
  user: string;
}

/**
 * Complete/continue a note based on existing content
 */
export function buildNoteCompleterPrompt(context: Record<string, any>, langInstruction: string): PromptResult {
  const title = context.title || '';
  const blocks = context.blocks || [];
  const existingContent = blocks.map((b: any) => {
    const prefix = b.type === 'bullet' ? '• ' : b.type === 'numbered' ? '1. ' : b.type === 'heading1' ? '# ' : b.type === 'heading2' ? '## ' : '';
    return prefix + (b.content || '');
  }).filter(Boolean).join('\n');

  // Truncate to save tokens
  const truncated = existingContent.length > 3000
    ? existingContent.substring(existingContent.length - 3000)
    : existingContent;

  return {
    system: `You are Noah AI, a writing assistant. ${langInstruction} Return JSON.
Continue writing the note naturally. Match the existing tone and style.
Return only NEW blocks to append (not the existing content).
Valid types: "heading1", "heading2", "heading3", "text", "bullet", "numbered", "quote", "todo", "code", "divider".`,
    user: `Continue this note titled "${title}".
Existing content:
${truncated}

Return {"blocks": [{"type": string, "content": string}]}.`,
  };
}
