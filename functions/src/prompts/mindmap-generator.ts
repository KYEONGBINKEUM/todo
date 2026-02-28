interface PromptResult {
  system: string;
  user: string;
}

/**
 * Generate a mindmap from user-provided text or topic
 */
export function buildMindmapGeneratorPrompt(context: Record<string, any>, langInstruction: string): PromptResult {
  const text = context.text || '';
  const existingNodes = context.existingNodes
    ? JSON.stringify(context.existingNodes.map((n: any) => ({ id: n.id, text: n.text })))
    : '';

  return {
    system: `You are Noah AI, a visual thinking assistant. ${langInstruction} Return JSON.
Create a hierarchical mindmap structure from the given text.
Rules:
- Create 1 central node at position (0, 0)
- Create 3-7 main branches radiating from center at radius ~300
- Each main branch can have 2-4 child nodes at radius ~550
- Keep node text concise (under 30 chars)
- Use these colors for variety: "#e94560", "#533483", "#0f3460", "#00b4d8", "#e76f51", "#2a9d8f", "#f4a261"
- All nodes should have width: 160, height: 60
- Position nodes in a balanced radial layout`,
    user: `Create a mindmap from this text:
"${text}"
${existingNodes ? `\nExisting nodes to consider: ${existingNodes}` : ''}

Return {"title": string, "nodes": [{"id": string, "text": string, "x": number, "y": number, "width": 160, "height": 60, "color": string}], "edges": [{"id": string, "from": string, "to": string, "style": "curved"}]}.`,
  };
}
