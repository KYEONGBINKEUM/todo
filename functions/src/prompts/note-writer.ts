interface PromptResult {
  system: string;
  user: string;
}

/**
 * Auto-write a note from its title (and optional existing blocks)
 */
export function buildNoteWriterPrompt(context: Record<string, any>, langInstruction: string): PromptResult {
  const title = context.title || '';
  const existingContent = context.existingBlocks
    ? context.existingBlocks.map((b: any) => b.content).filter(Boolean).join('\n')
    : '';

  return {
    system: `You are Noah AI, a writing assistant. ${langInstruction} Return JSON.
Generate structured note content as an array of blocks. Each block has "type" and "content".
Valid types: "heading1", "heading2", "heading3", "text", "bullet", "numbered", "quote", "todo", "code", "divider".
For "todo" blocks, also include "checked": false.
For "divider" blocks, content should be empty string.
Keep the note concise and well-structured.`,
    user: `Write a note titled "${title}".${existingContent ? `\nExisting content to build upon:\n${existingContent}` : ''}

Return {"blocks": [{"type": string, "content": string}]}.`,
  };
}
