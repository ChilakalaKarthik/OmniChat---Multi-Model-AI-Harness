import React, { useState } from 'react';
import {
  Copy,
  Check,
  Sparkles,
  User,
  Globe,
  RotateCcw,
  AlertTriangle,
  KeyRound,
  FileText,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { ChatMessage } from '../../types';
import { PROVIDERS, AVAILABLE_MODELS } from '../../constants/models';

interface MessageItemProps {
  message: ChatMessage;
  onRetry?: (messageId: string) => void;
  onOpenKeysModal?: () => void;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  onRetry,
  onOpenKeysModal,
}) => {
  const [copied, setCopied] = useState(false);

  const isUser = message.role === 'user';
  const providerMeta = message.providerUsed ? PROVIDERS[message.providerUsed] : null;
  const modelMeta = AVAILABLE_MODELS.find((m) => m.id === message.modelUsed);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  // Simple clean markdown-like renderer for text without heavy external libraries
  const renderFormattedContent = (text: string) => {
    if (!text) return null;

    const blocks = text.split('\n\n');

    return (
      <div className="space-y-3 leading-relaxed text-sm">
        {blocks.map((block, idx) => {
          // Code block
          if (block.startsWith('```') && block.endsWith('```')) {
            const lines = block.slice(3, -3).trim().split('\n');
            const lang = lines[0].match(/^[a-zA-Z0-9_-]+$/) ? lines[0] : '';
            const code = lang ? lines.slice(1).join('\n') : lines.join('\n');

            return (
              <div
                key={idx}
                className="my-3 rounded-xl bg-neutral-950 border border-neutral-800 overflow-hidden font-mono text-xs"
              >
                {lang && (
                  <div className="px-3 py-1 bg-neutral-900 border-b border-neutral-800 text-neutral-400 text-[11px] flex justify-between items-center">
                    <span>{lang}</span>
                  </div>
                )}
                <pre className="p-3.5 overflow-x-auto text-neutral-200">
                  <code>{code}</code>
                </pre>
              </div>
            );
          }

          // Blockquote
          if (block.startsWith('>')) {
            const quoteContent = block
              .split('\n')
              .map((line) => line.replace(/^>\s?/, ''))
              .join('\n');
            return (
              <blockquote
                key={idx}
                className="border-l-2 border-neutral-600 pl-3 py-0.5 text-neutral-400 italic text-xs"
              >
                {quoteContent}
              </blockquote>
            );
          }

          // Header
          if (block.startsWith('### ')) {
            return (
              <h4 key={idx} className="text-sm font-semibold text-neutral-200 mt-2 mb-1">
                {block.replace('### ', '')}
              </h4>
            );
          }
          if (block.startsWith('## ')) {
            return (
              <h3 key={idx} className="text-base font-semibold text-neutral-100 mt-3 mb-1">
                {block.replace('## ', '')}
              </h3>
            );
          }

          // Bullet list
          if (block.startsWith('- ') || block.startsWith('* ')) {
            const items = block.split('\n').filter((l) => l.startsWith('- ') || l.startsWith('* '));
            return (
              <ul key={idx} className="list-disc pl-5 space-y-1 text-neutral-300">
                {items.map((item, itemIdx) => {
                  const cleaned = item.replace(/^[-*]\s/, '');
                  return <li key={itemIdx}>{renderInlineMarkdown(cleaned)}</li>;
                })}
              </ul>
            );
          }

          return <p key={idx} className="text-neutral-200">{renderInlineMarkdown(block)}</p>;
        })}
      </div>
    );
  };

  // Helper for inline markdown bold and backticks
  const renderInlineMarkdown = (line: string) => {
    const parts = line.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
    return parts.map((part, pIdx) => {
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code
            key={pIdx}
            className="px-1.5 py-0.5 mx-0.5 bg-neutral-900 border border-neutral-800 rounded text-neutral-300 font-mono text-[12px]"
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={pIdx} className="font-semibold text-neutral-100">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part;
    });
  };

  return (
    <div
      className={`group w-full py-4 px-4 sm:px-6 transition-colors ${
        isUser ? 'bg-transparent' : 'bg-neutral-900/30 border-y border-neutral-850/60'
      }`}
    >
      <div className="max-w-3xl mx-auto flex items-start gap-4">
        {/* Avatar */}
        <div className="shrink-0 mt-0.5">
          {isUser ? (
            <div className="w-7 h-7 rounded-lg bg-neutral-800 border border-neutral-700 flex items-center justify-center text-neutral-300">
              <User className="w-4 h-4" />
            </div>
          ) : (
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-neutral-900 font-bold text-xs"
              style={{
                backgroundColor: providerMeta?.accentColor || '#38bdf8',
                color: '#0a0a0a',
              }}
            >
              <Sparkles className="w-3.5 h-3.5 fill-current" />
            </div>
          )}
        </div>

        {/* Message Content Container */}
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Metadata Header */}
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-neutral-200">
                {isUser ? 'You' : modelMeta?.name || 'Assistant'}
              </span>
              {!isUser && providerMeta && (
                <span className="text-[11px] font-mono text-neutral-500">
                  {providerMeta.name}
                </span>
              )}
              {message.groundingUsed === 'document' && (
                <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-mono">
                  <FileText className="w-3 h-3" />
                  <span>Document Grounded</span>
                </span>
              )}
              {message.groundingUsed && message.groundingUsed !== 'document' && (
                <span className="flex items-center gap-1 text-[11px] text-blue-400 font-mono">
                  <Globe className="w-3 h-3" />
                  <span>
                    {message.groundingUsed === 'gemini_google_search'
                      ? 'Google Search'
                      : 'SearXNG Web'}
                  </span>
                </span>
              )}
            </div>

            {/* Copy button */}
            <button
              type="button"
              onClick={handleCopy}
              className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-opacity"
              title="Copy message text"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>

          {/* Body */}
          <div className="text-neutral-200 font-sans space-y-2">
            {/* Distinct search wake-up status indicator while waiting/retrying (separate from final fallback) */}
            {message.searchStatus && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-950/40 border border-blue-800/80 text-[11px] text-blue-300 font-mono animate-pulse">
                <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin shrink-0" />
                <span>{message.searchStatus}</span>
              </div>
            )}

            {message.content && renderFormattedContent(message.content)}

            {/* Streaming Pulse Indicator */}
            {message.isStreaming && (
              <span className="inline-block w-2 h-4 ml-1 bg-neutral-400 animate-pulse align-middle" />
            )}

            {/* Note: No document loaded (Section 7 requirement) */}
            {message.docGroundingStatus === 'no_document_loaded' && (
              <div className="text-[11px] text-neutral-500 font-mono italic pt-0.5">
                Note: No document loaded
              </div>
            )}

            {/* Web Search Degradation Banner */}
            {message.webSearchFallback && (
              <div className="mt-2 px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-[11px] text-neutral-400 font-mono flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>
                  {message.webSearchFallbackReason ||
                    'Web search unavailable, answered from model knowledge only'}
                </span>
              </div>
            )}

            {/* Web Search Grounding Sources (Phase 4) */}
            {message.webSources && message.webSources.length > 0 && (
              <div className="mt-3 pt-2.5 border-t border-neutral-850/80">
                <div className="flex items-center gap-1.5 text-[11px] font-mono text-neutral-400 mb-2">
                  <Globe className="w-3.5 h-3.5 text-blue-400" />
                  <span>Grounding Sources ({message.webSources.length}):</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {message.webSources.map((source, idx) => (
                    <a
                      key={idx}
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 text-[11px] text-blue-300 hover:text-blue-200 transition-colors"
                      title={source.snippet || source.title}
                    >
                      <ExternalLink className="w-3 h-3 text-neutral-500 shrink-0" />
                      <span className="truncate max-w-[180px] sm:max-w-xs">{source.title}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Error & Degradation Handlers (Section 7) */}
            {message.error && (
              <div
                className={`mt-2 p-3 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                  message.errorType === 'rate_limited'
                    ? 'bg-amber-950/40 border-amber-800/80 text-amber-300'
                    : message.errorType === 'invalid_api_key'
                    ? 'bg-red-950/40 border-red-800/80 text-red-300'
                    : message.errorType === 'timeout'
                    ? 'bg-neutral-900 border-neutral-750 text-neutral-300'
                    : 'bg-neutral-900/90 border-neutral-800 text-neutral-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle
                    className={`w-4 h-4 shrink-0 ${
                      message.errorType === 'invalid_api_key'
                        ? 'text-red-400'
                        : message.errorType === 'rate_limited'
                        ? 'text-amber-400'
                        : 'text-neutral-400'
                    }`}
                  />
                  <span className="font-medium">{message.error}</span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {message.errorType === 'invalid_api_key' && onOpenKeysModal && (
                    <button
                      type="button"
                      onClick={onOpenKeysModal}
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-red-950 hover:bg-red-900 border border-red-800 text-red-200 rounded-lg text-xs font-medium transition-colors"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>Update Key</span>
                    </button>
                  )}

                  {message.canRetry && onRetry && (
                    <button
                      type="button"
                      onClick={() => onRetry(message.id)}
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 rounded-lg text-xs font-medium transition-colors"
                    >
                      <RotateCcw className="w-3 h-3 text-neutral-400" />
                      <span>Retry</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
