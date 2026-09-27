import { ProviderId } from './providers/types';

export interface ModelVerificationResult {
  provider: ProviderId;
  ok: boolean;
  availableModelIds: string[];
  error?: string;
}

/**
 * Calls each provider's model-list endpoint with the user's own key:
 * - GET /v1/models for OpenAI (https://api.openai.com/v1/models)
 * - GET /v1/models for xAI (https://api.x.ai/v1/models)
 * - GET /v1/models for Anthropic (https://api.anthropic.com/v1/models)
 * - GET /v1beta/models for Gemini (https://generativelanguage.googleapis.com/v1beta/models)
 */
export async function verifyProviderModels(
  provider: ProviderId,
  apiKey: string
): Promise<ModelVerificationResult> {
  const trimmedKey = apiKey.trim();
  if (!trimmedKey) {
    return {
      provider,
      ok: false,
      availableModelIds: [],
      error: `No API key provided for ${provider}.`,
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    switch (provider) {
      case 'openai': {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: {
            Authorization: `Bearer ${trimmedKey}`,
          },
          signal: controller.signal,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          return {
            provider,
            ok: false,
            availableModelIds: [],
            error: data?.error?.message || `OpenAI returned status ${res.status}`,
          };
        }

        const data = await res.json();
        const rawList = Array.isArray(data?.data) ? data.data : [];
        const modelIds: string[] = rawList
          .map((m: any) => String(m.id || ''))
          .filter(Boolean);

        return {
          provider,
          ok: true,
          availableModelIds: modelIds,
        };
      }

      case 'xai': {
        const res = await fetch('https://api.x.ai/v1/models', {
          headers: {
            Authorization: `Bearer ${trimmedKey}`,
          },
          signal: controller.signal,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          return {
            provider,
            ok: false,
            availableModelIds: [],
            error: data?.error?.message || `xAI returned status ${res.status}`,
          };
        }

        const data = await res.json();
        const rawList = Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data?.models)
          ? data.models
          : [];
        const modelIds: string[] = rawList
          .map((m: any) => String(m.id || m.name || ''))
          .filter(Boolean);

        return {
          provider,
          ok: true,
          availableModelIds: modelIds,
        };
      }

      case 'anthropic': {
        const res = await fetch('https://api.anthropic.com/v1/models', {
          headers: {
            'x-api-key': trimmedKey,
            'anthropic-version': '2023-06-01',
          },
          signal: controller.signal,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          return {
            provider,
            ok: false,
            availableModelIds: [],
            error: data?.error?.message || `Anthropic returned status ${res.status}`,
          };
        }

        const data = await res.json();
        const rawList = Array.isArray(data?.data) ? data.data : [];
        const modelIds: string[] = rawList
          .map((m: any) => String(m.id || ''))
          .filter(Boolean);

        return {
          provider,
          ok: true,
          availableModelIds: modelIds,
        };
      }

      case 'gemini': {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
            trimmedKey
          )}`,
          { signal: controller.signal }
        );

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          return {
            provider,
            ok: false,
            availableModelIds: [],
            error: data?.error?.message || `Gemini returned status ${res.status}`,
          };
        }

        const data = await res.json();
        const rawList = Array.isArray(data?.models) ? data.models : [];
        const modelIds: string[] = [];
        for (const m of rawList) {
          if (m?.name) {
            modelIds.push(String(m.name));
            modelIds.push(String(m.name).replace(/^models\//, ''));
          }
        }

        return {
          provider,
          ok: true,
          availableModelIds: Array.from(new Set(modelIds)),
        };
      }
    }
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Model verification timed out or connection failed';
    return {
      provider,
      ok: false,
      availableModelIds: [],
      error: message,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
