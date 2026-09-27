import { ModelOption, ProviderId } from '../types';

export interface ProviderMeta {
  id: ProviderId;
  name: string;
  shortName: string;
  tagline: string;
  keyPrefix: string;
  keyHelpUrl: string;
  placeholder: string;
  accentColor: string;
  badgeBg: string;
  badgeText: string;
  defaultModel: string;
}

export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    shortName: 'GPT',
    tagline: 'GPT-4o, reasoning & vision capabilities',
    keyPrefix: 'sk-',
    keyHelpUrl: 'https://platform.openai.com/api-keys',
    placeholder: 'sk-proj-...',
    accentColor: '#10a37f',
    badgeBg: 'bg-emerald-950/60',
    badgeText: 'text-emerald-400',
    defaultModel: 'gpt-4o',
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    shortName: 'Claude',
    tagline: 'Claude Sonnet 5 & Claude Haiku 4.5 with nuanced writing',
    keyPrefix: 'sk-ant-',
    keyHelpUrl: 'https://console.anthropic.com/settings/keys',
    placeholder: 'sk-ant-api03-...',
    accentColor: '#d97706',
    badgeBg: 'bg-amber-950/60',
    badgeText: 'text-amber-400',
    defaultModel: 'claude-sonnet-5',
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    shortName: 'Gemini',
    tagline: 'Gemini 3.8 Flash & Gemini 3 Pro with search grounding',
    keyPrefix: 'AIza',
    keyHelpUrl: 'https://aistudio.google.com/app/apikey',
    placeholder: 'AIzaSy...',
    accentColor: '#3b82f6',
    badgeBg: 'bg-blue-950/60',
    badgeText: 'text-blue-400',
    defaultModel: 'gemini-3.8-flash',
  },
  xai: {
    id: 'xai',
    name: 'xAI Grok',
    shortName: 'Grok',
    tagline: 'Grok 4.3 & Grok 4.3 Fast frontier models',
    keyPrefix: 'xai-',
    keyHelpUrl: 'https://console.x.ai',
    placeholder: 'xai-...',
    accentColor: '#8b5cf6',
    badgeBg: 'bg-purple-950/60',
    badgeText: 'text-purple-400',
    defaultModel: 'grok-4.3',
  },
};

export const AVAILABLE_MODELS: ModelOption[] = [
  // OpenAI
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    description: 'Flagship omni model with high-speed intelligence across multimodal tasks',
    contextWindow: '128k tokens',
    recommendedFor: 'Complex reasoning, code synthesis, nuanced instructions',
    isDefault: true,
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o mini',
    provider: 'openai',
    description: 'Fast, cost-efficient model for focused daily tasks and rapid iterations',
    contextWindow: '128k tokens',
    recommendedFor: 'Everyday inquiries, high-volume drafting, quick summaries',
  },

  // Anthropic
  {
    id: 'claude-sonnet-5',
    name: 'Claude Sonnet 5',
    provider: 'anthropic',
    description: 'Industry benchmark for code generation, visual comprehension, and technical prose',
    contextWindow: '200k tokens',
    recommendedFor: 'Software architecture, creative drafting, precise analysis',
    isDefault: true,
  },
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    description: 'Ultra-fast Claude model delivering high intelligence at lightning latency',
    contextWindow: '200k tokens',
    recommendedFor: 'Sub-second queries, quick extraction, structured transformation',
  },

  // Gemini
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    provider: 'gemini',
    description: 'Next-generation speed and multimodal reasoning with native Google Search grounding',
    contextWindow: '1M tokens',
    recommendedFor: 'Live web research, real-time knowledge, high-speed coding',
    isDefault: true,
  },
  {
    id: 'gemini-3-pro',
    name: 'Gemini 3 Pro',
    provider: 'gemini',
    description: 'Massive context window for digesting extensive books, audio, and codebases',
    contextWindow: '2M tokens',
    recommendedFor: 'Deep document comprehension, complex research syntheses',
  },

  // xAI Grok
  {
    id: 'grok-4.3',
    name: 'Grok 4.3',
    provider: 'xai',
    description: 'Frontier model with strong analytical reasoning and candid generation',
    contextWindow: '128k tokens',
    recommendedFor: 'Mathematical logic, candid commentary, objective dissection',
    isDefault: true,
  },
  {
    id: 'grok-4-fast-non-reasoning',
    name: 'Grok 4.3 Fast',
    provider: 'xai',
    description: 'Lightweight Grok model optimized for responsiveness and fast answers',
    contextWindow: '128k tokens',
    recommendedFor: 'Rapid interactive questions and direct responses',
  },
];
