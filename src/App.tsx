import React, { useState, useCallback, useEffect } from 'react';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { ChatCanvas } from './components/chat/ChatCanvas';
import { ApiKeyModal } from './components/keys/ApiKeyModal';
import { DocumentModal } from './components/rag/DocumentModal';
import { GmailModal } from './components/gmail/GmailModal';
import { ToastContainer, ToastItem } from './components/ui/Toast';
import { useApiKeys } from './hooks/useApiKeys';
import { useChat } from './hooks/useChat';
import { getStoredGmailCredentials } from './utils/storage';
import { ProviderId, KeyTabId, KeyTestResult } from './types';
import { PROVIDERS } from './constants/models';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

export default function App() {
  const {
    keys,
    hasKey,
    setKey,
    removeKey,
    clearAll,
    testKey,
    testResults,
    testingProvider,
    modelAvailability,
    verifyingProvider,
    verifyModels,
  } = useApiKeys();

  const {
    sessions,
    activeSession,
    activeSessionId,
    setActiveSessionId,
    setProviderAndModel,
    toggleWebSearch,
    startNewSession,
    deleteSession,
    clearCurrentSessionMessages,
    sendMessage,
    stopGeneration,
    retryLastMessage,
    attachDocument,
    removeDocument,
    isGenerating,
  } = useChat(hasKey, (p: ProviderId) => keys[p]);

  const [isKeysModalOpen, setIsKeysModalOpen] = useState(false);
  const [keysModalInitialProvider, setKeysModalInitialProvider] = useState<KeyTabId>('gemini');
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [isGmailModalOpen, setIsGmailModalOpen] = useState(false);
  const [hasGmailConnected, setHasGmailConnected] = useState<boolean>(() =>
    Boolean(getStoredGmailCredentials())
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Dark & Light Mode Theme Support
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('omnichat_theme');
      if (saved === 'light' || saved === 'dark') return saved;
    }
    return 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light');
      root.classList.remove('dark');
    } else {
      root.classList.add('dark');
      root.classList.remove('light');
    }
    localStorage.setItem('omnichat_theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  useEffect(() => {
    const handleGmailUpdate = () => {
      setHasGmailConnected(Boolean(getStoredGmailCredentials()));
    };
    window.addEventListener('omnichat:gmail_updated', handleGmailUpdate);
    return () => {
      window.removeEventListener('omnichat:gmail_updated', handleGmailUpdate);
    };
  }, []);

  const addToast = useCallback((type: 'error' | 'success' | 'info', message: string) => {
    const id = 'toast_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    setToasts((prev) => [...prev, { id, type, message }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const currentProvider = activeSession?.provider || null;
  const currentModelId = activeSession?.modelId || null;
  const hasKeyForSelected = currentProvider ? hasKey(currentProvider) : false;
  const hasTavilyKey = Boolean(keys.tavily && keys.tavily.trim());
  const keyTestFailed = currentProvider ? testResults[currentProvider]?.ok === false : false;

  // Intercept testKey to trigger toast on failure as specified in Section 7 & Part 2
  const handleTestKeyWithToast = async (
    provider: KeyTabId,
    customKey?: string
  ): Promise<KeyTestResult> => {
    const result = await testKey(provider, customKey);
    const providerName =
      provider === 'tavily'
        ? 'Tavily'
        : provider === 'gmail'
        ? 'Gmail'
        : PROVIDERS[provider as ProviderId]?.name || provider;
    if (!result.ok) {
      if (provider === 'tavily') {
        addToast('error', 'Invalid Tavily key');
      } else {
        addToast('error', `Invalid key for ${providerName}`);
      }
    } else {
      addToast('success', `${providerName} validated successfully`);
    }
    return result;
  };

  const handleVerifyModelsWithToast = async (
    provider?: ProviderId,
    customKey?: string
  ) => {
    const result = await verifyModels(provider, customKey);
    if (!result.ok) {
      addToast('error', result.message);
    } else if (result.unavailableModels.length > 0) {
      addToast(
        'info',
        `${result.unavailableModels.length} model(s) unavailable on account: ${result.unavailableModels.join(', ')}`
      );
    } else {
      addToast('success', result.message);
    }
    return result;
  };

  const handleOpenKeysForProvider = (provider?: KeyTabId | null) => {
    if (provider) {
      setKeysModalInitialProvider(provider);
    } else {
      setKeysModalInitialProvider('gemini');
    }
    setIsKeysModalOpen(true);
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-neutral-950 text-neutral-100 antialiased font-sans">
      {/* Top Header */}
      <Header
        currentProvider={currentProvider}
        currentModelId={currentModelId}
        onSelectModel={(pId, mId) => setProviderAndModel(pId, mId)}
        hasKeyForCurrentProvider={hasKeyForSelected}
        hasTavilyKey={hasTavilyKey}
        keyTestFailed={keyTestFailed}
        modelAvailability={modelAvailability}
        onOpenKeysModal={(tab) => handleOpenKeysForProvider((tab as KeyTabId) || currentProvider || 'gemini')}
        webSearchEnabled={activeSession?.webSearchEnabled || false}
        onToggleWebSearch={toggleWebSearch}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* Main Workspace: Sidebar + Chat Canvas */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Sidebar Toggle Button for small screens or collapse */}
        <button
          type="button"
          onClick={() => setSidebarOpen((prev) => !prev)}
          className="absolute bottom-4 left-4 z-30 sm:hidden p-2 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-300 shadow-lg"
          title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
        >
          {sidebarOpen ? (
            <PanelLeftClose className="w-4 h-4" />
          ) : (
            <PanelLeftOpen className="w-4 h-4" />
          )}
        </button>

        {/* Sidebar */}
        <div
          className={`${
            sidebarOpen ? 'block' : 'hidden'
          } sm:block h-full shrink-0 z-20 transition-all`}
        >
          <Sidebar
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectSession={setActiveSessionId}
            onNewSession={() => startNewSession(null, null)}
            onDeleteSession={deleteSession}
            hasKey={hasKey}
            hasTavilyKey={hasTavilyKey}
            hasGmailConnected={hasGmailConnected}
            webSearchEnabled={activeSession?.webSearchEnabled || false}
            onToggleWebSearch={toggleWebSearch}
            onOpenKeysModal={(tab) => handleOpenKeysForProvider((tab as KeyTabId) || currentProvider || 'gemini')}
            currentProvider={currentProvider}
            onSelectProvider={(pId) => setProviderAndModel(pId)}
            onOpenToolPreview={() => {}}
            onOpenDocModal={() => setIsDocModalOpen(true)}
            onOpenGmailModal={() => setIsGmailModalOpen(true)}
            activeDoc={activeSession?.documentAttached}
          />
        </div>

        {/* Chat Canvas Viewport */}
        {activeSession ? (
          <ChatCanvas
            session={activeSession}
            hasKeyForSelectedModel={hasKeyForSelected}
            onSendMessage={sendMessage}
            isGenerating={isGenerating}
            onStop={stopGeneration}
            onClearSession={clearCurrentSessionMessages}
            onOpenKeysModal={() => handleOpenKeysForProvider(currentProvider || 'gemini')}
            onToggleWebSearch={toggleWebSearch}
            onOpenDocModal={() => setIsDocModalOpen(true)}
            onRemoveDoc={removeDocument}
            onRetryMessage={retryLastMessage}
            onSelectProvider={(pId) => setProviderAndModel(pId)}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-neutral-500 text-xs">
            No active conversation.
          </div>
        )}
      </div>

      {/* API Key Modal with Model Verification & Services */}
      <ApiKeyModal
        isOpen={isKeysModalOpen}
        onClose={() => setIsKeysModalOpen(false)}
        keys={keys}
        onSaveKey={setKey}
        onRemoveKey={removeKey}
        onClearAll={clearAll}
        onTestKey={handleTestKeyWithToast}
        onVerifyModels={handleVerifyModelsWithToast}
        testResults={testResults}
        testingProvider={testingProvider}
        modelAvailability={modelAvailability}
        verifyingProvider={verifyingProvider}
        initialProvider={keysModalInitialProvider}
        onOpenGmailAssistant={() => setIsGmailModalOpen(true)}
      />

      {/* Phase 3: Document RAG Upload & Management Modal */}
      <DocumentModal
        isOpen={isDocModalOpen}
        onClose={() => setIsDocModalOpen(false)}
        attachedDoc={activeSession?.documentAttached}
        onAttachDocument={(doc) => {
          attachDocument(doc);
        }}
        onRemoveDocument={removeDocument}
        onErrorToast={(msg) => addToast('error', msg)}
        onSuccessToast={(msg) => addToast('success', msg)}
      />

      {/* Part 3: Gmail Assistant IMAP Modal */}
      <GmailModal
        isOpen={isGmailModalOpen}
        onClose={() => setIsGmailModalOpen(false)}
        currentProvider={currentProvider || 'gemini'}
        currentModelId={currentModelId || 'gemini-3.8-flash'}
        keys={keys}
        onInsertToChat={(text) => {
          sendMessage(text);
        }}
        onToast={addToast}
      />

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
