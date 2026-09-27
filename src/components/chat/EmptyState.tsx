import React from 'react';
import { Key, Globe, FileText, ArrowRight, ShieldCheck, Cpu } from 'lucide-react';
import { ProviderId } from '../../types';
import { PROVIDERS, AVAILABLE_MODELS } from '../../constants/models';

interface EmptyStateProps {
  currentProvider: ProviderId | null;
  currentModelId: string | null;
  hasKey: boolean;
  onOpenKeysModal: () => void;
  onSelectPrompt: (prompt: string) => void;
  onSelectProvider?: (provider: ProviderId) => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  currentProvider,
  currentModelId,
  hasKey,
  onOpenKeysModal,
  onSelectPrompt,
  onSelectProvider,
}) => {
  const provider = currentProvider ? PROVIDERS[currentProvider] : null;
  const model = currentModelId ? AVAILABLE_MODELS.find((m) => m.id === currentModelId) : null;

  const samplePrompts = [
    {
      title: 'Analyze & Debug Code',
      prompt: 'Review this TypeScript function for potential race conditions and optimize it for memory efficiency.',
    },
    {
      title: 'Compare Frontier Architectures',
      prompt: 'Summarize the architectural differences between GPT-4o, Claude 3.5 Sonnet, and Gemini 2.0 Flash.',
    },
    {
      title: 'Draft Technical Proposal',
      prompt: 'Draft an executive RFC proposal for migrating a monolithic app to an event-driven microservices setup.',
    },
    {
      title: 'Real-time Grounding Test',
      prompt: 'What are the most notable announcements from recent tech developer conferences this month?',
    },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-2xl mx-auto space-y-8 animate-in fade-in duration-300">
      {/* Brand & Active Model Hero */}
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-900 border border-neutral-800 text-xs text-neutral-300">
          {provider ? (
            <>
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: provider.accentColor }}
              />
              <span className="font-semibold text-neutral-200">{provider.name}</span>
              <span className="text-neutral-500">·</span>
              <span className="font-mono text-neutral-400">{model?.name || currentModelId}</span>
            </>
          ) : (
            <>
              <Cpu className="w-3.5 h-3.5 text-neutral-400" />
              <span className="font-medium text-neutral-300">Select a Model Provider</span>
            </>
          )}
        </div>

        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-neutral-100 text-balance">
          Bring Your Own Key AI Workbench
        </h1>

        <p className="text-sm text-neutral-400 max-w-lg mx-auto leading-relaxed">
          Switch seamlessly between OpenAI, Anthropic, Gemini, and xAI. Ephemeral browser sessions with direct proxying and zero database tracking.
        </p>
      </div>

      {/* Provider Selection Grid if None is Selected */}
      {!currentProvider ? (
        <div className="w-full space-y-3">
          <div className="text-xs font-mono uppercase tracking-wider text-neutral-500 text-left px-1">
            Choose a Provider to Begin
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-left">
            {(['openai', 'anthropic', 'gemini', 'xai'] as ProviderId[]).map((pId) => {
              const pMeta = PROVIDERS[pId];
              return (
                <button
                  key={pId}
                  type="button"
                  onClick={() => onSelectProvider && onSelectProvider(pId)}
                  className="group p-3.5 rounded-xl bg-neutral-900/60 hover:bg-neutral-850 border border-neutral-800/80 hover:border-neutral-700 text-left transition-all flex flex-col justify-between cursor-pointer"
                >
                  <div className="flex items-center justify-between w-full mb-1.5">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: pMeta.accentColor }}
                      />
                      <span className="text-xs font-semibold text-neutral-200 group-hover:text-white">
                        {pMeta.name}
                      </span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-neutral-500 group-hover:text-neutral-200 transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <p className="text-[11px] text-neutral-400 line-clamp-2 leading-relaxed">
                    {pMeta.tagline}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      ) : !hasKey ? (
        /* Key Status Callout */
        <div className="w-full p-4 rounded-2xl bg-amber-950/20 border border-amber-800/60 text-left flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5" />
              <span>{provider?.name} API Key Required</span>
            </div>
            <p className="text-xs text-neutral-400">
              Your key is saved only in this browser tab&apos;s sessionStorage and discarded when you close the tab.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenKeysModal}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-400 hover:bg-amber-300 text-neutral-950 shrink-0 transition-colors cursor-pointer"
          >
            Configure Key
          </button>
        </div>
      ) : (
        /* Sample Prompts */
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-left">
          {samplePrompts.map((item, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => onSelectPrompt(item.prompt)}
              className="group p-3 rounded-xl bg-neutral-900/60 hover:bg-neutral-850 border border-neutral-800/80 hover:border-neutral-700 text-left transition-all space-y-1 flex flex-col justify-between cursor-pointer"
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-xs font-semibold text-neutral-200 group-hover:text-white">
                  {item.title}
                </span>
                <ArrowRight className="w-3 h-3 text-neutral-500 group-hover:text-neutral-300 transition-transform group-hover:translate-x-0.5" />
              </div>
              <p className="text-[11px] text-neutral-400 line-clamp-2 leading-relaxed">
                {item.prompt}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Features preview */}
      <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-neutral-500 font-mono pt-2">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>sessionStorage keys</span>
        </div>
        <span>·</span>
        <div className="flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5 text-blue-400" />
          <span>Web Search Grounding</span>
        </div>
        <span>·</span>
        <div className="flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-amber-400" />
          <span>Document RAG</span>
        </div>
      </div>
    </div>
  );
};
