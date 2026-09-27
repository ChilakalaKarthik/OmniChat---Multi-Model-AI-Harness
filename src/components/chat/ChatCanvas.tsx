import React, { useRef, useEffect } from 'react';
import { Trash2, FileText, Globe } from 'lucide-react';
import { ChatSession } from '../../types';
import { MessageItem } from './MessageItem';
import { Composer } from './Composer';
import { EmptyState } from './EmptyState';
import { PROVIDERS, AVAILABLE_MODELS } from '../../constants/models';

interface ChatCanvasProps {
  session: ChatSession;
  hasKeyForSelectedModel: boolean;
  onSendMessage: (text: string) => void;
  isGenerating: boolean;
  onStop: () => void;
  onClearSession: () => void;
  onOpenKeysModal: () => void;
  onToggleWebSearch: () => void;
  onOpenDocModal: () => void;
  onRemoveDoc: () => void;
  onRetryMessage?: (messageId: string) => void;
}

export const ChatCanvas: React.FC<ChatCanvasProps> = ({
  session,
  hasKeyForSelectedModel,
  onSendMessage,
  isGenerating,
  onStop,
  onClearSession,
  onOpenKeysModal,
  onToggleWebSearch,
  onOpenDocModal,
  onRemoveDoc,
  onRetryMessage,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const providerMeta = PROVIDERS[session.provider];
  const modelMeta = AVAILABLE_MODELS.find((m) => m.id === session.modelId);

  // Auto-scroll to bottom on message or stream change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session.messages, session.messages[session.messages.length - 1]?.content]);

  const hasMessages = session.messages.length > 0;

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-neutral-950 overflow-hidden relative">
      {/* Subheader / Context Bar */}
      <div className="h-10 px-4 sm:px-6 border-b border-neutral-850 flex items-center justify-between text-xs text-neutral-400 bg-neutral-950/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2 truncate">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: providerMeta.accentColor }}
          />
          <span className="font-semibold text-neutral-200">{providerMeta.name}</span>
          <span className="text-neutral-600">/</span>
          <span className="font-mono text-neutral-300 truncate">
            {modelMeta?.name || session.modelId}
          </span>

          {/* Web Search Chip */}
          {session.webSearchEnabled && (
            <span className="ml-1 text-[11px] font-mono text-blue-400 bg-blue-950/50 px-1.5 py-0.5 rounded border border-blue-900/60 hidden sm:inline-flex items-center gap-1">
              <Globe className="w-3 h-3" />
              <span>{session.provider === 'gemini' ? 'Google Search' : 'SearXNG'}</span>
            </span>
          )}

          {/* Attached Document Chip (Phase 3) */}
          {session.documentAttached && (
            <button
              type="button"
              onClick={onOpenDocModal}
              title={`Attached: ${session.documentAttached.filename} (${session.documentAttached.chunkCount} chunks)`}
              className="ml-1 text-[11px] font-mono text-emerald-400 bg-emerald-950/50 hover:bg-emerald-900/50 px-2 py-0.5 rounded border border-emerald-800/80 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <FileText className="w-3 h-3" />
              <span className="truncate max-w-[140px]">{session.documentAttached.filename}</span>
              <span className="text-emerald-500/80 text-[10px]">({session.documentAttached.chunkCount} chunks)</span>
            </button>
          )}
        </div>

        {hasMessages && (
          <button
            type="button"
            onClick={onClearSession}
            title="Clear messages in this conversation"
            className="flex items-center gap-1 text-neutral-500 hover:text-neutral-300 text-[11px] font-medium transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            <span className="hidden sm:inline">Clear Chat</span>
          </button>
        )}
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto">
        {!hasMessages ? (
          <EmptyState
            currentProvider={session.provider}
            currentModelId={session.modelId}
            hasKey={hasKeyForSelectedModel}
            onOpenKeysModal={onOpenKeysModal}
            onSelectPrompt={onSendMessage}
          />
        ) : (
          <div className="py-4 space-y-1">
            {session.messages.map((message) => (
              <MessageItem
                key={message.id}
                message={message}
                onRetry={onRetryMessage}
                onOpenKeysModal={onOpenKeysModal}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Sticky Bottom Composer */}
      <div className="shrink-0 bg-gradient-to-t from-neutral-950 via-neutral-950/95 to-transparent pt-3">
        <Composer
          onSendMessage={onSendMessage}
          isGenerating={isGenerating}
          onStop={onStop}
          hasKeyForSelectedModel={hasKeyForSelectedModel}
          currentProvider={session.provider}
          currentModelId={session.modelId}
          onOpenKeysModal={onOpenKeysModal}
          webSearchEnabled={session.webSearchEnabled}
          onToggleWebSearch={onToggleWebSearch}
          onOpenDocModal={onOpenDocModal}
          attachedDoc={session.documentAttached}
          onRemoveDoc={onRemoveDoc}
        />
      </div>
    </div>
  );
};
