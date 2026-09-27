import { useState, useEffect, useCallback } from 'react';
import { ApiKeys, ProviderId, KeyTabId, KeyTestResult, ModelAvailabilityMap } from '../types';
import {
  getStoredApiKeys,
  saveStoredApiKeys,
  clearStoredApiKey,
  clearAllStoredApiKeys,
  getStoredModelAvailability,
  saveStoredModelAvailability,
} from '../utils/storage';
import { AVAILABLE_MODELS } from '../constants/models';

export function useApiKeys() {
  const [keys, setKeys] = useState<ApiKeys>(getStoredApiKeys);
  const [testResults, setTestResults] = useState<Record<string, KeyTestResult | null>>({
    openai: null,
    anthropic: null,
    gemini: null,
    xai: null,
    tavily: null,
  });
  const [testingProvider, setTestingProvider] = useState<KeyTabId | null>(null);

  // Model availability tracking: modelId -> boolean (true = verified available, false = unavailable on account)
  const [modelAvailability, setModelAvailability] = useState<ModelAvailabilityMap>(
    getStoredModelAvailability
  );
  const [verifyingProvider, setVerifyingProvider] = useState<ProviderId | 'all' | null>(null);

  // Sync state when sessionStorage updates
  useEffect(() => {
    const handleUpdate = () => {
      setKeys(getStoredApiKeys());
      setModelAvailability(getStoredModelAvailability());
    };

    window.addEventListener('omnichat:keys_updated', handleUpdate);
    return () => {
      window.removeEventListener('omnichat:keys_updated', handleUpdate);
    };
  }, []);

  const hasKey = useCallback(
    (provider: ProviderId | 'tavily'): boolean => {
      const key = keys[provider];
      return typeof key === 'string' && key.trim().length > 0;
    },
    [keys]
  );

  const setKey = useCallback(
    (provider: KeyTabId, value: string) => {
      const next = { ...keys, [provider]: value.trim() };
      if (!value.trim()) {
        delete next[provider];
      }
      saveStoredApiKeys(next);
      setKeys(next);
      // Reset test result on change
      setTestResults((prev) => ({ ...prev, [provider]: null }));
    },
    [keys]
  );

  const removeKey = useCallback((provider: KeyTabId) => {
    clearStoredApiKey(provider);
    setKeys(getStoredApiKeys());
    setTestResults((prev) => ({ ...prev, [provider]: null }));
    // Clear availability for this provider's models if applicable
    if (provider !== 'tavily') {
      setModelAvailability((prev) => {
        const next = { ...prev };
        AVAILABLE_MODELS.filter((m) => m.provider === provider).forEach((m) => {
          delete next[m.id];
        });
        saveStoredModelAvailability(next);
        return next;
      });
    }
  }, []);

  const clearAll = useCallback(() => {
    clearAllStoredApiKeys();
    setKeys({});
    setTestResults({
      openai: null,
      anthropic: null,
      gemini: null,
      xai: null,
      tavily: null,
    });
    setModelAvailability({});
    saveStoredModelAvailability({});
  }, []);

  const testKey = useCallback(
    async (provider: KeyTabId, testKeyValue?: string): Promise<KeyTestResult> => {
      const apiKey = (testKeyValue ?? keys[provider] ?? '').trim();
      if (!apiKey) {
        const res: KeyTestResult = {
          ok: false,
          provider: provider as any,
          reason: `No API key entered for ${provider}.`,
        };
        setTestResults((prev) => ({ ...prev, [provider]: res }));
        return res;
      }

      setTestingProvider(provider);
      try {
        const response = await fetch('/api/keys/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, apiKey }),
        });

        const data = await response.json();
        const result: KeyTestResult = {
          ok: Boolean(data.ok),
          provider: provider as any,
          reason: data.reason,
          message: data.message || (data.ok ? 'Key verified successfully' : 'Verification failed'),
        };

        setTestResults((prev) => ({ ...prev, [provider]: result }));
        return result;
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Network error testing API key';
        const result: KeyTestResult = {
          ok: false,
          provider: provider as any,
          reason: errorMessage,
        };
        setTestResults((prev) => ({ ...prev, [provider]: result }));
        return result;
      } finally {
        setTestingProvider(null);
      }
    },
    [keys]
  );

  /**
   * Calls provider model-list endpoints to verify if exact model IDs are active on the account:
   * GET /v1/models (OpenAI & xAI), GET /v1/models (Anthropic), GET /v1beta/models (Gemini)
   */
  const verifyModels = useCallback(
    async (
      targetProvider?: ProviderId,
      customKey?: string
    ): Promise<{
      ok: boolean;
      message: string;
      unavailableModels: string[];
      availableModels: string[];
    }> => {
      if (targetProvider) {
        const apiKey = (customKey ?? keys[targetProvider] ?? '').trim();
        if (!apiKey) {
          return {
            ok: false,
            message: `Please enter an API key for ${targetProvider} first.`,
            unavailableModels: [],
            availableModels: [],
          };
        }

        setVerifyingProvider(targetProvider);
        try {
          const res = await fetch('/api/models/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: targetProvider, apiKey }),
          });

          const data = await res.json();
          if (!res.ok || !data.ok) {
            return {
              ok: false,
              message: data.error || `Failed to verify models for ${targetProvider}`,
              unavailableModels: [],
              availableModels: [],
            };
          }

          const providerModelIds = (data.availableModelIds || []) as string[];
          const providerModels = AVAILABLE_MODELS.filter((m) => m.provider === targetProvider);

          const newlyAvailable: string[] = [];
          const newlyUnavailable: string[] = [];

          const updatedMap = { ...modelAvailability };
          for (const m of providerModels) {
            // Check exact match or normalized match
            const isAvail =
              providerModelIds.includes(m.id) ||
              providerModelIds.includes(`models/${m.id}`) ||
              providerModelIds.some(
                (retId) => retId.toLowerCase() === m.id.toLowerCase()
              );

            updatedMap[m.id] = isAvail;
            if (isAvail) {
              newlyAvailable.push(m.name);
            } else {
              newlyUnavailable.push(m.name);
            }
          }

          setModelAvailability(updatedMap);
          saveStoredModelAvailability(updatedMap);

          return {
            ok: true,
            message:
              newlyUnavailable.length > 0
                ? `${newlyUnavailable.length} model(s) unavailable on this account: ${newlyUnavailable.join(', ')}`
                : `All ${providerModels.length} models verified and available!`,
            unavailableModels: newlyUnavailable,
            availableModels: newlyAvailable,
          };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Error verifying models';
          return {
            ok: false,
            message: msg,
            unavailableModels: [],
            availableModels: [],
          };
        } finally {
          setVerifyingProvider(null);
        }
      } else {
        // Verify all providers with keys
        setVerifyingProvider('all');
        try {
          const res = await fetch('/api/models/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keys }),
          });

          const data = await res.json();
          if (!res.ok || !data.ok || !data.results) {
            return {
              ok: false,
              message: 'Failed to verify models across providers',
              unavailableModels: [],
              availableModels: [],
            };
          }

          const updatedMap = { ...modelAvailability };
          const unavailableNames: string[] = [];
          const availableNames: string[] = [];

          for (const p of ['openai', 'anthropic', 'gemini', 'xai'] as ProviderId[]) {
            const pRes = data.results[p];
            if (pRes && pRes.ok && Array.isArray(pRes.availableModelIds)) {
              const pModels = AVAILABLE_MODELS.filter((m) => m.provider === p);
              for (const m of pModels) {
                const isAvail =
                  pRes.availableModelIds.includes(m.id) ||
                  pRes.availableModelIds.includes(`models/${m.id}`) ||
                  pRes.availableModelIds.some(
                    (retId: string) => retId.toLowerCase() === m.id.toLowerCase()
                  );
                updatedMap[m.id] = isAvail;
                if (isAvail) {
                  availableNames.push(m.name);
                } else {
                  unavailableNames.push(m.name);
                }
              }
            }
          }

          setModelAvailability(updatedMap);
          saveStoredModelAvailability(updatedMap);

          return {
            ok: true,
            message:
              unavailableNames.length > 0
                ? `${unavailableNames.length} model(s) marked unavailable on connected accounts.`
                : 'All configured models verified successfully.',
            unavailableModels: unavailableNames,
            availableModels: availableNames,
          };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Error verifying models';
          return {
            ok: false,
            message: msg,
            unavailableModels: [],
            availableModels: [],
          };
        } finally {
          setVerifyingProvider(null);
        }
      }
    },
    [keys, modelAvailability]
  );

  return {
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
  };
}
