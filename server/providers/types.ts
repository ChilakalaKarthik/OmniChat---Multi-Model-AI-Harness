export type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'xai';

export interface InternalMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatRequestBody {
  provider: ProviderId;
  apiKey: string;
  model: string;
  messages: InternalMessage[];
  contextChunks?: string[];
  docId?: string;
  webSearch?: boolean;
  tavilyKey?: string;
  keys?: Record<string, string>;
}

export type SSECallback = (type: 'token' | 'done' | 'error', data: unknown) => void;
