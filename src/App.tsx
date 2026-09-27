import React, { useState, useCallback } from 'react';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { ChatCanvas } from './components/chat/ChatCanvas';
import { ApiKeyModal } from './components/keys/ApiKeyModal';
import { DocumentModal } from './components/rag/DocumentModal';
import { ToolPreviewModal } from './components/context/ToolPreviewModal';
import { ToastContainer, ToastItem } from './components/ui/Toast';
import { useApiKeys } from './hooks/useApiKeys';
import { useChat } from './hooks/useChat';
import { ProviderId, KeyTestResult } from './types';
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
  const [keysModalInitialProvider, setKeysModalInitialProvider] = useState<ProviderId>('gemini');
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [toolPreview, setToolPreview] = useState<'gmail' | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((type: 'error' | 'success' | 'info', message: string) => {
    const id = 'toast_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    setToasts((prev) => [...prev, { id, type, message }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const currentProvider = activeSession?.provider || 'gemini';
  const currentModelId = activeSession?.modelId || 'gemini-3.8-flash';
  const hasKeyForSelected = hasKey(currentProvider);
  const keyTestFailed = testResults[currentProvider]?.ok === false;

  // Intercept testKey to trigger toast on failure as specified in Section 7
  const handleTestKeyWithToast = async (
    provider: ProviderId,
    customKey?: string
  ): Promise<KeyTestResult> => {
    const result = await testKey(provider, customKey);
    const providerName = PROVIDERS[provider]?.name || provider;
    if (!result.ok) {
      addToast('error', `Invalid key for ${providerName}`);
    } else {
      addToast('success', `${providerName} key validated successfully`);
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

  const handleOpenKeysForProvider = (provider?: ProviderId) => {
    if (provider) {
      setKeysModalInitialProvider(provider);
    } else {
      setKeysModalInitialProvider(currentProvider);
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
        keyTestFailed={keyTestFailed}
        modelAvailability={modelAvailability}
        onOpenKeysModal={() => handleOpenKeysForProvider(currentProvider)}
        onNewChat={() => startNewSession(currentProvider, currentModelId)}
        webSearchEnabled={activeSession?.webSearchEnabled || false}
        onToggleWebSearch={toggleWebSearch}
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
            onNewSession={() => startNewSession(currentProvider, currentModelId)}
            onDeleteSession={deleteSession}
            hasKey={hasKey}
            onOpenKeysModal={() => handleOpenKeysForProvider(currentProvider)}
            currentProvider={currentProvider}
            onSelectProvider={(pId) => setProviderAndModel(pId)}
            onOpenToolPreview={() => setToolPreview('gmail')}
            onOpenDocModal={() => setIsDocModalOpen(true)}
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
            onOpenKeysModal={() => handleOpenKeysForProvider(currentProvider)}
            onToggleWebSearch={toggleWebSearch}
            onOpenDocModal={() => setIsDocModalOpen(true)}
            onRemoveDoc={removeDocument}
            onRetryMessage={retryLastMessage}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-neutral-500 text-xs">
            No active conversation.
          </div>
        )}
      </div>

      {/* API Key Modal with Model Verification */}
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

      {/* Gmail Assistant Preview Drawer */}
      <ToolPreviewModal
        tool={toolPreview}
        onClose={() => setToolPreview(null)}
      />

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
