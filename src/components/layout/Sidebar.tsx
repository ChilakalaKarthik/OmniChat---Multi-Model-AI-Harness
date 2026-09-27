import React from 'react';
import {
  Plus,
  Trash2,
  Globe,
  FileText,
  Mail,
  ChevronRight,
  CircleDashed,
} from 'lucide-react';
import { ChatSession, ProviderId, DocumentAttachment } from '../../types';
import { PROVIDERS } from '../../constants/models';

interface SidebarProps {
  sessions: ChatSession[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  hasKey: (provider: ProviderId) => boolean;
  hasTavilyKey?: boolean;
  hasGmailConnected?: boolean;
  webSearchEnabled: boolean;
  onToggleWebSearch: () => void;
  onOpenKeysModal: (initialTab?: string) => void;
  currentProvider: ProviderId | null;
  onSelectProvider: (provider: ProviderId | null) => void;
  onOpenToolPreview: (tool: 'rag' | 'gmail') => void;
  onOpenDocModal: () => void;
  onOpenGmailModal: () => void;
  activeDoc?: DocumentAttachment;
}

export const Sidebar: React.FC<SidebarProps> = ({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  hasKey,
  hasTavilyKey,
  hasGmailConnected,
  webSearchEnabled,
  onToggleWebSearch,
  onOpenKeysModal,
  currentProvider,
  onSelectProvider,
  onOpenDocModal,
  onOpenGmailModal,
  activeDoc,
}) => {
  return (
    <aside className="w-56 h-full bg-neutral-950 border-r border-neutral-800 flex flex-col justify-between shrink-0 select-none">
      {/* Top Section */}
      <div className="flex flex-col flex-1 min-h-0 overflow-y-auto p-2.5 space-y-3">
        {/* New Chat Action */}
        <button
          type="button"
          onClick={onNewSession}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 text-xs font-semibold text-neutral-950 bg-neutral-100 hover:bg-white rounded-lg transition-colors shadow-sm cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Conversation</span>
        </button>

        {/* Sessions List */}
        <div className="space-y-1">
          <div className="flex items-center justify-between px-1.5 text-[10px] font-mono uppercase tracking-wider text-neutral-500">
            <span>Conversations</span>
            <span className="tabular-nums font-mono text-neutral-600">{sessions.length}</span>
          </div>

          <div className="space-y-0.5 max-h-40 overflow-y-auto pr-0.5">
            {sessions.map((session) => {
              const isActive = session.id === activeSessionId;
              const providerMeta = session.provider ? PROVIDERS[session.provider] : null;

              return (
                <div
                  key={session.id}
                  onClick={() => onSelectSession(session.id)}
                  className={`group relative flex items-center justify-between px-2 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-neutral-850 text-neutral-100 font-medium'
                      : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0 pr-4">
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: providerMeta?.accentColor || '#737373' }}
                    />
                    <span className="truncate text-[11px]">{session.title || 'Untitled Chat'}</span>
                  </div>

                  {/* Message count and delete action */}
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] text-neutral-600 font-mono tabular-nums">
                      {session.messages.length}
                    </span>
                    <button
                      type="button"
                      title="Delete conversation"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSession(session.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-400 text-neutral-500 rounded transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Model Providers Matrix */}
        <div className="space-y-1 pt-2 border-t border-neutral-850">
          <div className="flex items-center justify-between px-1.5 text-[10px] font-mono uppercase tracking-wider text-neutral-500">
            <span>Model Providers</span>
            <button
              type="button"
              onClick={() => onOpenKeysModal()}
              className="text-neutral-400 hover:text-neutral-200 flex items-center gap-0.5 text-[10px] lowercase hover:underline"
            >
              <span>manage</span>
              <ChevronRight className="w-2.5 h-2.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-0.5">
            {/* None / Default Option */}
            <div
              onClick={() => onSelectProvider(null)}
              className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-xs cursor-pointer border transition-colors ${
                currentProvider === null
                  ? 'border-neutral-700 bg-neutral-900 text-neutral-100 font-medium'
                  : 'border-transparent text-neutral-400 hover:bg-neutral-900/60 hover:text-neutral-300'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <CircleDashed className="w-3 h-3 text-neutral-500 shrink-0" />
                <span className="text-[11px]">None</span>
              </div>
              <span className="text-[10px] font-mono text-neutral-500">
                {currentProvider === null ? 'selected' : 'clear'}
              </span>
            </div>

            {/* Provider Options */}
            {(['openai', 'anthropic', 'gemini', 'xai'] as ProviderId[]).map((pId) => {
              const p = PROVIDERS[pId];
              const configured = hasKey(pId);
              const isCurrent = currentProvider === pId;

              return (
                <div
                  key={pId}
                  onClick={() => onSelectProvider(pId)}
                  className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-xs cursor-pointer border transition-colors ${
                    isCurrent
                      ? 'border-neutral-700 bg-neutral-900 text-neutral-100 font-medium'
                      : 'border-transparent text-neutral-400 hover:bg-neutral-900/60 hover:text-neutral-300'
                  }`}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: p.accentColor }}
                    />
                    <span className="text-[11px] truncate">{p.name}</span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {configured ? (
                      <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono">
                        <span className="w-1 h-1 rounded-full bg-emerald-400" />
                        ready
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenKeysModal(pId);
                        }}
                        className="text-[10px] text-neutral-500 hover:text-amber-400 font-mono underline"
                      >
                        add key
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Context Tools */}
        <div className="space-y-1 pt-2 border-t border-neutral-850">
          <div className="px-1.5 text-[10px] font-mono uppercase tracking-wider text-neutral-500">
            Context Tools
          </div>

          <div className="space-y-0.5">
            {/* Web Search */}
            <button
              type="button"
              onClick={() => {
                if (currentProvider && currentProvider !== 'gemini' && !hasTavilyKey) {
                  onOpenKeysModal('tavily');
                } else {
                  onToggleWebSearch();
                }
              }}
              className={`w-full text-left px-2 py-1.5 rounded-lg border text-xs flex items-center justify-between transition-colors cursor-pointer ${
                webSearchEnabled
                  ? 'bg-blue-950/50 border-blue-800/80 text-blue-300 hover:bg-blue-900/60'
                  : 'bg-neutral-900/40 hover:bg-neutral-900 border-neutral-850 text-neutral-300 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Globe className="w-3 h-3 text-blue-400 shrink-0" />
                <span className="text-[11px]">Web Search</span>
              </div>
              <span className="text-[10px] font-mono">
                {webSearchEnabled ? (
                  <span className="flex items-center gap-1 text-blue-400">
                    <span className="w-1 h-1 rounded-full bg-blue-400 animate-pulse" />
                    on
                  </span>
                ) : (
                  <span className="text-neutral-500">
                    {currentProvider === 'gemini'
                      ? 'off'
                      : hasTavilyKey
                      ? 'off'
                      : 'key'}
                  </span>
                )}
              </span>
            </button>

            {/* Document RAG Action Button */}
            <button
              type="button"
              onClick={onOpenDocModal}
              className={`w-full text-left px-2 py-1.5 rounded-lg border text-xs flex items-center justify-between transition-colors cursor-pointer ${
                activeDoc
                  ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300 hover:bg-emerald-900/50'
                  : 'bg-neutral-900/40 hover:bg-neutral-900 border-neutral-850 text-neutral-300 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-1.5 truncate pr-1">
                <FileText className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="truncate text-[11px]">
                  {activeDoc ? activeDoc.filename : 'Document RAG'}
                </span>
              </div>
              <span className="text-[10px] font-mono shrink-0">
                {activeDoc ? (
                  <span className="text-emerald-400 font-medium">{activeDoc.chunkCount}c</span>
                ) : (
                  <span className="text-neutral-500">Attach</span>
                )}
              </span>
            </button>

            {/* Gmail Assistant Action Button */}
            <button
              type="button"
              onClick={onOpenGmailModal}
              className={`w-full text-left px-2 py-1.5 rounded-lg border text-xs flex items-center justify-between transition-colors cursor-pointer ${
                hasGmailConnected
                  ? 'bg-rose-950/40 border-rose-800/80 text-rose-300 hover:bg-rose-900/50'
                  : 'bg-neutral-900/40 hover:bg-neutral-900 border-neutral-850 text-neutral-300 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Mail className="w-3 h-3 text-rose-400 shrink-0" />
                <span className="text-[11px]">Gmail</span>
              </div>
              <span className="text-[10px] font-mono">
                {hasGmailConnected ? (
                  <span className="flex items-center gap-1 text-emerald-400">
                    <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                    ready
                  </span>
                ) : (
                  <span className="text-neutral-500">Connect</span>
                )}
              </span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
