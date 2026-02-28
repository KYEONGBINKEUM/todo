/**
 * Noah AI - Request/Response types shared between client and Cloud Functions
 */

export type NoahAIAction =
  | 'suggest_tasks'
  | 'prioritize'
  | 'schedule'
  | 'breakdown'
  | 'auto_write_note'
  | 'complete_note'
  | 'youtube_to_note'
  | 'youtube_to_mindmap'
  | 'generate_mindmap';

export interface NoahAIRequest {
  action: NoahAIAction;
  context: Record<string, any>;
  language: string;
}

export interface NoahAIResponse {
  result: any;
  tokensUsed: {
    input: number;
    output: number;
  };
  monthlyUsage: {
    used: number;
    limit: number; // -1 = unlimited
  };
}

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  action?: NoahAIAction;
  timestamp: number;
  structuredData?: any;
  isLoading?: boolean;
}

export interface AISuggestionChip {
  id: string;
  label: string;
  action: NoahAIAction;
  icon: string;
  description?: string;
}
