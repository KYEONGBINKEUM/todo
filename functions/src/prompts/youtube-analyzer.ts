interface PromptResult {
  system: string;
  user: string;
}

/**
 * Summarize YouTube transcript as structured note blocks
 */
export function buildYouTubeToNotePrompt(context: Record<string, any>, langInstruction: string): PromptResult {
  const transcript = context.transcript || '';
  const videoTitle = context.videoTitle || 'YouTube Video';

  return {
    system: `You are Noah AI, a content summarizer. ${langInstruction} Return JSON.
Summarize the video transcript into a well-structured note.
Use various block types for readability.
Valid types: "heading1", "heading2", "heading3", "text", "bullet", "numbered", "quote", "divider".
Include key points, main arguments, and actionable takeaways.`,
    user: `Summarize this YouTube video transcript into a note.
Video: "${videoTitle}"
Transcript:
${transcript}

Return {"title": string, "blocks": [{"type": string, "content": string}]}.`,
  };
}

/**
 * Convert YouTube transcript to mindmap structure
 */
export function buildYouTubeToMindmapPrompt(context: Record<string, any>, langInstruction: string): PromptResult {
  const transcript = context.transcript || '';
  const videoTitle = context.videoTitle || 'YouTube Video';

  return {
    system: `You are Noah AI, a content organizer. ${langInstruction} Return JSON.
Convert the video content into a hierarchical mindmap structure.
Create a central node and 3-7 main branches with 2-4 sub-nodes each.
Keep node text concise (under 30 characters per node).
Position nodes in a radial layout around the center (0,0).
Main nodes at radius ~300, sub-nodes at radius ~550.`,
    user: `Convert this YouTube video into a mindmap.
Video: "${videoTitle}"
Transcript:
${transcript}

Return {"title": string, "nodes": [{"id": string, "text": string, "x": number, "y": number, "color": string}], "edges": [{"id": string, "from": string, "to": string}]}.`,
  };
}
