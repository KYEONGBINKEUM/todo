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
  const videoAuthor = context.videoAuthor || '';
  const videoDescription = context.videoDescription || '';
  const hasTranscript = context.hasTranscript !== false;

  if (hasTranscript && transcript) {
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

  // Fallback: analyze based on metadata only
  return {
    system: `You are Noah AI, a content analyst. ${langInstruction} Return JSON.
The video transcript is unavailable. Analyze the video based on its title, author, and description.
Infer the likely content and structure a comprehensive note.
Use various block types: "heading1", "heading2", "heading3", "text", "bullet", "numbered", "quote", "divider".
Clearly note that this is an AI inference based on video metadata, not actual transcript.`,
    user: `Analyze this YouTube video and create a structured note based on available information.
Title: "${videoTitle}"
Author: "${videoAuthor}"
Description: "${videoDescription}"

Based on the title and description, infer the key topics, structure, and likely content of this video.
Return {"title": string, "blocks": [{"type": string, "content": string}]}.`,
  };
}

/**
 * Convert YouTube transcript to mindmap structure
 */
export function buildYouTubeToMindmapPrompt(context: Record<string, any>, langInstruction: string): PromptResult {
  const transcript = context.transcript || '';
  const videoTitle = context.videoTitle || 'YouTube Video';
  const videoAuthor = context.videoAuthor || '';
  const videoDescription = context.videoDescription || '';
  const hasTranscript = context.hasTranscript !== false;

  if (hasTranscript && transcript) {
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

  // Fallback: mindmap from metadata
  return {
    system: `You are Noah AI, a content organizer. ${langInstruction} Return JSON.
The video transcript is unavailable. Create a mindmap based on the video title, author, and description.
Infer the likely topics and structure.
Create a central node and 3-7 main branches with 2-4 sub-nodes each.
Keep node text concise (under 30 characters per node).
Position nodes in a radial layout around the center (0,0).
Main nodes at radius ~300, sub-nodes at radius ~550.`,
    user: `Create a mindmap for this YouTube video based on available information.
Title: "${videoTitle}"
Author: "${videoAuthor}"
Description: "${videoDescription}"

Return {"title": string, "nodes": [{"id": string, "text": string, "x": number, "y": number, "color": string}], "edges": [{"id": string, "from": string, "to": string}]}.`,
  };
}
