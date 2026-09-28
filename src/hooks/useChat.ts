import { useState, useCallback, useRef } from 'react';
import {
  ChatSession,
  ChatMessage,
  ProviderId,
  MessageErrorType,
  DocumentAttachment,
} from '../types';
import { AVAILABLE_MODELS, PROVIDERS } from '../constants/models';
import { getStoredApiKeys } from '../utils/storage';

function createNewSession(provider: ProviderId | null = null, modelId?: string | null): ChatSession {
  const chosenModel = provider ? (modelId || PROVIDERS[provider].defaultModel) : null;
  return {
    id: 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    title: 'New Conversation',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    provider,
    modelId: chosenModel,
    messages: [],
    webSearchEnabled: false,
  };
}

export function useChat(
  hasKeyForProvider: (provider: ProviderId) => boolean,
  getKeyForProvider: (provider: ProviderId) => string | undefined
) {
  const [sessions, setSessions] = useState<ChatSession[]>(() => [createNewSession(null, null)]);
  const [activeSessionId, setActiveSessionId] = useState<string>(() => sessions[0]?.id || '');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const userAbortedRef = useRef<boolean>(false);

  // Active session helper
  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0];

  const setProviderAndModel = useCallback(
    (provider: ProviderId | null, modelId?: string | null) => {
      const targetModel = provider ? (modelId || PROVIDERS[provider].defaultModel) : null;
      const storedKeys = getStoredApiKeys();
      const hasTavily = Boolean(storedKeys.tavily && storedKeys.tavily.trim());

      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== activeSession.id) return s;
          // If switching to non-Gemini and no Tavily key, auto-disable web search
          const shouldKeepWebSearch =
            s.webSearchEnabled && provider && (provider === 'gemini' || hasTavily);

          return {
            ...s,
            provider,
            modelId: targetModel,
            webSearchEnabled: Boolean(shouldKeepWebSearch),
            updatedAt: Date.now(),
          };
        })
      );
    },
    [activeSession?.id]
  );

  const toggleWebSearch = useCallback(() => {
    const storedKeys = getStoredApiKeys();
    const hasTavily = Boolean(storedKeys.tavily && storedKeys.tavily.trim());

    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== activeSession.id) return s;
        // If non-Gemini and turning on without Tavily key, prevent toggle
        const nextEnabled = !s.webSearchEnabled;
        if (nextEnabled && s.provider !== 'gemini' && !hasTavily) {
          return { ...s, webSearchEnabled: false, updatedAt: Date.now() };
        }
        return { ...s, webSearchEnabled: nextEnabled, updatedAt: Date.now() };
      })
    );
  }, [activeSession?.id]);

  const attachDocument = useCallback(
    (doc: DocumentAttachment) => {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSession.id
            ? { ...s, documentAttached: doc, updatedAt: Date.now() }
            : s
        )
      );
    },
    [activeSession?.id]
  );

  const removeDocument = useCallback(() => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSession.id
          ? { ...s, documentAttached: undefined, updatedAt: Date.now() }
          : s
      )
    );
  }, [activeSession?.id]);

  const startNewSession = useCallback(
    (provider?: ProviderId | null, modelId?: string | null) => {
      const targetProvider = provider !== undefined ? provider : activeSession?.provider || null;
      const targetModel = modelId !== undefined ? modelId : activeSession?.modelId || null;
      const newSess = createNewSession(targetProvider, targetModel);
      setSessions((prev) => [newSess, ...prev]);
      setActiveSessionId(newSess.id);
      return newSess.id;
    },
    [activeSession]
  );

  const deleteSession = useCallback(
    (sessionId: string) => {
      setSessions((prev) => {
        const filtered = prev.filter((s) => s.id !== sessionId);
        if (filtered.length === 0) {
          const fresh = createNewSession(null, null);
          setActiveSessionId(fresh.id);
          return [fresh];
        }
        if (activeSessionId === sessionId) {
          setActiveSessionId(filtered[0].id);
        }
        return filtered;
      });
    },
    [activeSessionId]
  );

  const clearCurrentSessionMessages = useCallback(() => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSession.id
          ? { ...s, messages: [], updatedAt: Date.now() }
          : s
      )
    );
  }, [activeSession?.id]);

  const stopGeneration = useCallback(() => {
    userAbortedRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsGenerating(false);
    if (activeSession) {
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== activeSession.id) return s;
          return {
            ...s,
            messages: s.messages.map((m) =>
              m.isStreaming ? { ...m, isStreaming: false } : m
            ),
          };
        })
      );
    }
  }, [activeSession]);

  // Real Chat Streaming via /api/chat with full Section 7 error handling & Direct Web Search fallback
  const sendMessage = useCallback(
    async (userInput: string) => {
      if (!userInput.trim() || isGenerating) return;
      if (!activeSession) return;

      const currentProvider = activeSession.provider;
      const currentModelId = activeSession.modelId;
      const apiKey = currentProvider ? getKeyForProvider(currentProvider) : undefined;
      const hasLLM = Boolean(currentProvider && currentModelId && apiKey && apiKey.trim());

      userAbortedRef.current = false;
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const userMsg: ChatMessage = {
        id: 'msg_' + Date.now() + '_user',
        role: 'user',
        content: userInput.trim(),
        timestamp: Date.now(),
      };

      const isFirstMessage = activeSession.messages.length === 0;
      const updatedTitle = isFirstMessage
        ? userInput.trim().slice(0, 32) + (userInput.trim().length > 32 ? '…' : '')
        : activeSession.title;

      const assistantMsgId = 'msg_' + (Date.now() + 1) + '_assistant';
      const storedKeys = getStoredApiKeys();

      // Handle Direct Web Search mode (no LLM selected or configured)
      if (!hasLLM) {
        const searchAssistantMsg: ChatMessage = {
          id: assistantMsgId,
          role: 'assistant',
          content: '',
          timestamp: Date.now() + 1,
          modelUsed: 'Web Search',
          providerUsed: undefined,
          groundingUsed: 'searxng',
          searchStatus: 'Searching the web for live results…',
          isStreaming: true,
        };

        setSessions((prev) =>
          prev.map((s) =>
            s.id === activeSession.id
              ? {
                  ...s,
                  title: updatedTitle,
                  messages: [...s.messages, userMsg, searchAssistantMsg],
                  updatedAt: Date.now(),
                }
              : s
          )
        );

        setIsGenerating(true);

        try {
          const res = await fetch('/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: userInput.trim(),
              tavilyKey: storedKeys.tavily,
            }),
            signal: controller.signal,
          });

          const data = await res.json().catch(() => ({ ok: false }));

          if (data.ok && Array.isArray(data.results) && data.results.length > 0) {
            const resultsFormatted =
              `### Web Search Results for "${userInput.trim()}"\n\n` +
              data.results
                .map(
                  (item: any, idx: number) =>
                    `**${idx + 1}. [${item.title}](${item.url})**\n${item.snippet}`
                )
                .join('\n\n---\n\n');

            setSessions((prev) =>
              prev.map((s) => {
                if (s.id !== activeSession.id) return s;
                return {
                  ...s,
                  messages: s.messages.map((m) =>
                    m.id === assistantMsgId
                      ? {
                          ...m,
                          content: resultsFormatted,
                          webSources: data.results,
                          searchStatus: null,
                          isStreaming: false,
                        }
                      : m
                  ),
                };
              })
            );
          } else {
            const errorText =
              `### Web Search Results\n\nNo search results found for "${userInput.trim()}". ` +
              (data.error ? `\n\n*${data.error}*` : '') +
              `\n\n*Tip: You can select an AI model provider above or configure API keys in key settings.*`;

            setSessions((prev) =>
              prev.map((s) => {
                if (s.id !== activeSession.id) return s;
                return {
                  ...s,
                  messages: s.messages.map((m) =>
                    m.id === assistantMsgId
                      ? {
                          ...m,
                          content: errorText,
                          searchStatus: null,
                          isStreaming: false,
                        }
                      : m
                  ),
                };
              })
            );
          }
        } catch (err: unknown) {
          const isAbort = (err as Error)?.name === 'AbortError';
          setSessions((prev) =>
            prev.map((s) => {
              if (s.id !== activeSession.id) return s;
              return {
                ...s,
                messages: s.messages.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        error: isAbort
                          ? 'Search cancelled'
                          : 'Web search unavailable, please check network connection',
                        errorType: 'connection_lost',
                        canRetry: true,
                        isStreaming: false,
                        searchStatus: null,
                      }
                    : m
                ),
              };
            })
          );
        } finally {
          setIsGenerating(false);
        }
        return;
      }

      const hasDoc = Boolean(activeSession.documentAttached);
      const promptMentionsDoc = /\b(document|pdf|file|attached|rag|report|excerpt|paper)\b/i.test(
        userInput
      );

      const initialAssistantMsg: ChatMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now() + 1,
        modelUsed: currentModelId,
        providerUsed: currentProvider,
        groundingUsed: hasDoc
          ? 'document'
          : activeSession.webSearchEnabled
          ? currentProvider === 'gemini'
            ? 'gemini_google_search'
            : 'tavily'
          : null,
        docGroundingStatus: hasDoc
          ? 'grounded'
          : promptMentionsDoc
          ? 'no_document_loaded'
          : undefined,
        isStreaming: true,
      };

      // Prepare conversation payload for backend
      const messageHistory = activeSession.messages
        .filter((m) => !m.error && m.content)
        .map((m) => ({ role: m.role, content: m.content }));
      messageHistory.push({ role: 'user', content: userInput.trim() });

      // Append user msg + empty assistant msg
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSession.id
            ? {
                ...s,
                title: updatedTitle,
                messages: [...s.messages, userMsg, initialAssistantMsg],
                updatedAt: Date.now(),
              }
            : s
        )
      );

      setIsGenerating(true);

      let accumulated = '';
      let receivedDone = false;

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            provider: currentProvider,
            apiKey: apiKey.trim(),
            model: currentModelId,
            messages: messageHistory,
            webSearch: activeSession.webSearchEnabled,
            tavilyKey: storedKeys.tavily,
            keys: storedKeys,
            docId: activeSession.documentAttached?.id,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const status = response.status;
          let errorType: MessageErrorType = 'general';
          let errorMessage = `Provider request failed (HTTP ${status})`;

          if (status === 429) {
            errorType = 'rate_limited';
            errorMessage = 'Rate limited, retry in a moment';
          } else if (status === 401 || status === 403) {
            errorType = 'invalid_api_key';
            errorMessage = `Invalid API key for ${PROVIDERS[currentProvider].name}`;
          } else if (status >= 500) {
            errorType = 'server_error';
            errorMessage = "Model didn't respond, try again";
          }

          setSessions((prev) =>
            prev.map((s) => {
              if (s.id !== activeSession.id) return s;
              return {
                ...s,
                messages: s.messages.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        error: errorMessage,
                        errorType,
                        canRetry: errorType !== 'invalid_api_key',
                        isStreaming: false,
                      }
                    : m
                ),
              };
            })
          );
          setIsGenerating(false);
          return;
        }

        if (!response.body) {
          throw new Error('No response stream available');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) continue;

            if (trimmed.startsWith('data: ')) {
              try {
                const sseData = JSON.parse(trimmed.slice(6));
                const { type, data } = sseData;

                if (type === 'token') {
                  if (typeof data === 'string') {
                    accumulated += data;
                    setSessions((prev) =>
                      prev.map((s) => {
                        if (s.id !== activeSession.id) return s;
                        return {
                          ...s,
                          messages: s.messages.map((m) =>
                            m.id === assistantMsgId
                              ? { ...m, content: accumulated, isStreaming: true, searchStatus: null }
                              : m
                          ),
                        };
                      })
                    );
                  }
                } else if (type === 'web_search_status') {
                  setSessions((prev) =>
                    prev.map((s) => {
                      if (s.id !== activeSession.id) return s;
                      return {
                        ...s,
                        messages: s.messages.map((m) =>
                          m.id === assistantMsgId
                            ? {
                                ...m,
                                searchStatus: String(
                                  data || 'Waking up search service…'
                                ),
                              }
                            : m
                        ),
                      };
                    })
                  );
                } else if (type === 'web_search_sources') {
                  setSessions((prev) =>
                    prev.map((s) => {
                      if (s.id !== activeSession.id) return s;
                      return {
                        ...s,
                        messages: s.messages.map((m) =>
                          m.id === assistantMsgId
                            ? { ...m, webSources: data as any, searchStatus: null }
                            : m
                        ),
                      };
                    })
                  );
                } else if (type === 'web_search_fallback') {
                  setSessions((prev) =>
                    prev.map((s) => {
                      if (s.id !== activeSession.id) return s;
                      return {
                        ...s,
                        messages: s.messages.map((m) =>
                          m.id === assistantMsgId
                            ? {
                                ...m,
                                webSearchFallback: true,
                                webSearchFallbackReason:
                                  typeof data === 'string' && data
                                    ? data
                                    : 'Web search unavailable, answered from model knowledge only',
                                searchStatus: null,
                              }
                            : m
                        ),
                      };
                    })
                  );
                } else if (type === 'done') {
                  receivedDone = true;
                  setSessions((prev) =>
                    prev.map((s) => {
                      if (s.id !== activeSession.id) return s;
                      return {
                        ...s,
                        messages: s.messages.map((m) =>
                          m.id === assistantMsgId
                            ? { ...m, isStreaming: false }
                            : m
                        ),
                      };
                    })
                  );
                } else if (type === 'error') {
                  receivedDone = true;
                  let errorType: MessageErrorType = 'general';
                  let errorMessage = String(data);

                  if (data === 'rate_limited') {
                    errorType = 'rate_limited';
                    errorMessage = 'Rate limited, retry in a moment';
                  } else if (data === 'timeout') {
                    errorType = 'timeout';
                    errorMessage = "Model didn't respond, try again";
                  } else if (data === 'invalid_api_key') {
                    errorType = 'invalid_api_key';
                    errorMessage = `Invalid API key for ${PROVIDERS[currentProvider].name}`;
                  } else if (data === 'server_error') {
                    errorType = 'server_error';
                    errorMessage = "Model didn't respond, try again";
                  }

                  setSessions((prev) =>
                    prev.map((s) => {
                      if (s.id !== activeSession.id) return s;
                      return {
                        ...s,
                        messages: s.messages.map((m) =>
                          m.id === assistantMsgId
                            ? {
                                ...m,
                                error: errorMessage,
                                errorType,
                                canRetry: errorType !== 'invalid_api_key',
                                isStreaming: false,
                              }
                            : m
                        ),
                      };
                    })
                  );
                }
              } catch {
                // Partial JSON or formatting anomaly
              }
            }
          }
        }

        // Section 7: Network drop mid-stream
        // "Frontend detects SSE close without a 'done' event -> shows partial message + 'Connection lost, response may be incomplete'"
        if (!receivedDone && !userAbortedRef.current) {
          setSessions((prev) =>
            prev.map((s) => {
              if (s.id !== activeSession.id) return s;
              return {
                ...s,
                messages: s.messages.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        error: 'Connection lost, response may be incomplete',
                        errorType: 'connection_lost',
                        canRetry: true,
                        isStreaming: false,
                      }
                    : m
                ),
              };
            })
          );
        } else {
          // Finalize streaming state
          setSessions((prev) =>
            prev.map((s) => {
              if (s.id !== activeSession.id) return s;
              return {
                ...s,
                messages: s.messages.map((m) =>
                  m.id === assistantMsgId ? { ...m, isStreaming: false } : m
                ),
              };
            })
          );
        }
      } catch (err: unknown) {
        if (userAbortedRef.current) {
          // User deliberately clicked Stop, not a network error
          setSessions((prev) =>
            prev.map((s) => {
              if (s.id !== activeSession.id) return s;
              return {
                ...s,
                messages: s.messages.map((m) =>
                  m.id === assistantMsgId ? { ...m, isStreaming: false } : m
                ),
              };
            })
          );
        } else {
          const isAbort = (err as Error)?.name === 'AbortError';
          const errorMessage = isAbort
            ? "Model didn't respond, try again"
            : 'Connection lost, response may be incomplete';

          setSessions((prev) =>
            prev.map((s) => {
              if (s.id !== activeSession.id) return s;
              return {
                ...s,
                messages: s.messages.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        error: errorMessage,
                        errorType: isAbort ? 'timeout' : 'connection_lost',
                        canRetry: true,
                        isStreaming: false,
                      }
                    : m
                ),
              };
            })
          );
        }
      } finally {
        setIsGenerating(false);
      }
    },
    [activeSession, isGenerating, getKeyForProvider]
  );

  // Retry action for rate-limited, timed-out, or failed messages
  const retryLastMessage = useCallback(
    (failedAssistantMsgId: string) => {
      if (!activeSession) return;
      const msgIndex = activeSession.messages.findIndex((m) => m.id === failedAssistantMsgId);
      if (msgIndex <= 0) return;

      const userMsg = activeSession.messages[msgIndex - 1];
      if (userMsg && userMsg.role === 'user') {
        const textToRetry = userMsg.content;
        // Remove both user message and failed assistant message to re-send cleanly
        setSessions((prev) =>
          prev.map((s) => {
            if (s.id !== activeSession.id) return s;
            return {
              ...s,
              messages: s.messages.filter(
                (m) => m.id !== failedAssistantMsgId && m.id !== userMsg.id
              ),
            };
          })
        );
        // Small delay to let state update, then send
        setTimeout(() => {
          sendMessage(textToRetry);
        }, 50);
      }
    },
    [activeSession, sendMessage]
  );

  return {
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
  };
}
