export type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'xai';

export interface ModelOption {
  id: string;
  name: string;
  provider: ProviderId;
  description: string;
  contextWindow: string;
  recommendedFor?: string;
  isDefault?: boolean;
}

export interface ApiKeys {
  openai?: string;
  anthropic?: string;
  gemini?: string;
  xai?: string;
  tavily?: string;
}

export type KeyTabId = ProviderId | 'tavily';

export type MessageRole = 'user' | 'assistant' | 'system';

export type MessageErrorType =
  | 'rate_limited'
  | 'timeout'
  | 'connection_lost'
  | 'invalid_api_key'
  | 'server_error'
  | 'general';

export interface DocumentAttachment {
  id: string;
  filename: string;
  chunkCount: number;
  sizeBytes: number;
  uploadedAt?: number;
}

export interface WebSource {
  title: string;
  url: string;
  snippet?: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  modelUsed?: string;
  providerUsed?: ProviderId;
  groundingUsed?: 'gemini_google_search' | 'tavily' | 'searxng' | 'document' | null;
  docGroundingStatus?: 'grounded' | 'no_document_loaded';
  webSources?: WebSource[];
  webSearchFallback?: boolean;
  webSearchFallbackReason?: string;
  searchStatus?: string | null;
  error?: string;
  errorType?: MessageErrorType;
  canRetry?: boolean;
  isStreaming?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  provider: ProviderId;
  modelId: string;
  messages: ChatMessage[];
  webSearchEnabled: boolean;
  documentAttached?: DocumentAttachment;
}

export interface KeyTestResult {
  ok: boolean;
  reason?: string;
  provider?: ProviderId;
  message?: string;
}

export type ModelAvailabilityMap = Record<string, boolean>; // modelId -> true (available) / false (unavailable)
export type ProviderVerifiedModelsMap = Record<ProviderId, string[] | null>; // provider -> array of available model IDs

