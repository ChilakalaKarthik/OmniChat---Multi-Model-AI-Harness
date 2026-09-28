import React, { useRef, useEffect, useState } from 'react';
import {
  ArrowUp,
  Square,
  Globe,
  Paperclip,
  Key,
  AlertCircle,
  FileText,
  X,
} from 'lucide-react';
import { ProviderId, DocumentAttachment } from '../../types';
import { PROVIDERS, AVAILABLE_MODELS } from '../../constants/models';

interface ComposerProps {
  onSendMessage: (text: string) => void;
  isGenerating: boolean;
  onStop: () => void;
  hasKeyForSelectedModel: boolean;
  currentProvider: ProviderId | null;
  currentModelId: string | null;
  onOpenKeysModal: () => void;
  webSearchEnabled: boolean;
  onToggleWebSearch: () => void;
  onOpenDocModal?: () => void;
  attachedDoc?: DocumentAttachment;
  onRemoveDoc?: () => void;
}

export const Composer: React.FC<ComposerProps> = ({
  onSendMessage,
  isGenerating,
  onStop,
  hasKeyForSelectedModel,
  currentProvider,
  currentModelId,
  onOpenKeysModal,
  webSearchEnabled,
  onToggleWebSearch,
  onOpenDocModal,
  attachedDoc,
  onRemoveDoc,
}) => {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const providerMeta = currentProvider ? PROVIDERS[currentProvider] : null;
  const modelMeta = currentModelId ? AVAILABLE_MODELS.find((m) => m.id === currentModelId) : null;

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 180)}px`;
    }
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    if (!input.trim() || isGenerating) return;
    onSendMessage(input);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const canSend = input.trim().length > 0 && !isGenerating;

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Missing Key Warning Banner (Required by Section 7) */}
      {currentProvider && !hasKeyForSelectedModel && providerMeta && (
        <div className="mb-2.5 px-3.5 py-2.5 rounded-xl bg-amber-950/40 border border-amber-800/80 text-amber-300 text-xs flex items-center justify-between shadow-lg backdrop-blur-sm animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Add an API key for <strong className="text-amber-200">{providerMeta.name}</strong> to chat with{' '}
              <span className="font-mono">{modelMeta?.name || currentModelId}</span>.
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenKeysModal}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-neutral-950 rounded-lg font-semibold text-xs transition-colors shrink-0 cursor-pointer"
          >
            <Key className="w-3.5 h-3.5" />
            <span>Add Key</span>
          </button>
        </div>
      )}

      {/* Main Composer Box */}
      <div
        className={`relative rounded-2xl bg-neutral-900 border transition-all ${
          !currentProvider || !hasKeyForSelectedModel
            ? 'border-neutral-800 opacity-85'
            : 'border-neutral-800 focus-within:border-neutral-700 focus-within:ring-1 focus-within:ring-neutral-700 shadow-xl'
        }`}
      >
        {/* Attached Document Pill (Phase 3 RAG) */}
        {attachedDoc && (
          <div className="px-3.5 pt-2.5 flex items-center gap-2">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-emerald-950/50 border border-emerald-800/80 text-emerald-300 text-xs font-mono">
              <FileText className="w-3.5 h-3.5 text-emerald-400" />
              <span className="truncate max-w-[200px] sm:max-w-xs">{attachedDoc.filename}</span>
              <span className="text-emerald-500/80 text-[10px]">({attachedDoc.chunkCount} chunks)</span>
              {onRemoveDoc && (
                <button
                  type="button"
                  onClick={onRemoveDoc}
                  className="p-0.5 hover:bg-emerald-900/60 rounded text-emerald-400 hover:text-emerald-200 transition-colors"
                  title="Remove document from chat"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isGenerating}
          rows={1}
          placeholder={
            !currentProvider || !hasKeyForSelectedModel
              ? 'Search the web directly (or select an AI model above)...'
              : attachedDoc
              ? `Ask questions grounded in ${attachedDoc.filename}...`
              : `Message ${modelMeta?.name || 'model'}... (Shift+Enter for new line)`
          }
          className="w-full bg-transparent px-4 pt-3 pb-2 text-sm text-neutral-100 placeholder:text-neutral-500 resize-none focus:outline-none max-h-48 font-sans disabled:cursor-not-allowed"
        />

        {/* Toolbar & Actions */}
        <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
          {/* Left Toolbar Controls */}
          <div className="flex items-center gap-1.5">
            {/* Web Search Toggle */}
            <button
              type="button"
              onClick={onToggleWebSearch}
              title={
                webSearchEnabled
                  ? 'Web search enabled'
                  : 'Enable Web Search'
              }
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                webSearchEnabled || !currentProvider || !hasKeyForSelectedModel
                  ? 'bg-blue-950/60 border-blue-700/80 text-blue-300 shadow-sm'
                  : 'bg-neutral-850/60 border-neutral-800 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium">Search</span>
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  webSearchEnabled || !currentProvider || !hasKeyForSelectedModel
                    ? 'bg-blue-400 animate-pulse'
                    : 'bg-neutral-600'
                }`}
              />
            </button>

            {/* Document RAG upload trigger (Phase 3) */}
            <button
              type="button"
              onClick={onOpenDocModal}
              title={
                attachedDoc
                  ? `Active document: ${attachedDoc.filename}. Click to replace or remove.`
                  : 'Attach Document for RAG (PDF, DOCX, TXT)'
              }
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border transition-colors cursor-pointer ${
                attachedDoc
                  ? 'bg-emerald-950/50 border-emerald-800/80 text-emerald-300'
                  : 'bg-neutral-850/40 border-neutral-800 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Paperclip className="w-3 h-3" />
              <span className="text-[11px] hidden sm:inline">
                {attachedDoc ? 'Doc Attached' : 'Attach Doc'}
              </span>
            </button>
          </div>

          {/* Right Action: Send or Stop */}
          <div className="flex items-center gap-2">
            {isGenerating ? (
              <button
                type="button"
                onClick={onStop}
                className="flex items-center gap-1 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-750 text-neutral-200 rounded-xl text-xs font-medium transition-colors cursor-pointer"
                title="Stop response generation"
              >
                <Square className="w-3 h-3 fill-current text-red-400" />
                <span>Stop</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSend}
                className={`p-2 rounded-xl text-neutral-950 transition-all ${
                  canSend
                    ? 'bg-neutral-100 hover:bg-white cursor-pointer shadow-md'
                    : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                }`}
                title={
                  canSend
                    ? !currentProvider || !hasKeyForSelectedModel
                      ? 'Search the web directly'
                      : 'Send message'
                    : 'Type a message or search query'
                }
              >
                <ArrowUp className="w-4 h-4 stroke-[2.5]" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
