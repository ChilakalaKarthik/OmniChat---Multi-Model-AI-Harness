import { ProviderId } from './providers/types';

export interface KeyTestOutput {
  ok: boolean;
  provider: ProviderId;
  reason?: string;
  message?: string;
}

export async function testProviderApiKey(
  provider: ProviderId,
  apiKey: string
): Promise<KeyTestOutput> {
  const trimmedKey = apiKey.trim();
  if (!trimmedKey) {
    return {
      ok: false,
      provider,
      reason: `No API key provided for ${provider}.`,
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

        if (res.ok) {
          return {
            ok: true,
            provider,
            message: 'OpenAI API key verified and operational.',
          };
        }

        const data = await res.json().catch(() => ({}));
        const reason =
          data?.error?.message ||
          (res.status === 401
            ? 'Invalid OpenAI API key (401 Unauthorized).'
            : res.status === 429
            ? 'OpenAI rate limit or credit quota reached (429).'
            : `OpenAI returned status ${res.status}`);

        return { ok: false, provider, reason };
      }

      case 'anthropic': {
        // Test with minimal 1-token message call
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': trimmedKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-3-5-haiku-20241022',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'ping' }],
          }),
          signal: controller.signal,
        });

        if (res.ok) {
          return {
            ok: true,
            provider,
            message: 'Anthropic API key verified and operational.',
          };
        }

        const data = await res.json().catch(() => ({}));
        const reason =
          data?.error?.message ||
          (res.status === 401
            ? 'Invalid Anthropic API key (401 Unauthorized).'
            : res.status === 429
            ? 'Anthropic rate limit or credit balance exhausted (429).'
            : `Anthropic returned status ${res.status}`);

        return { ok: false, provider, reason };
      }

      case 'gemini': {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
            trimmedKey
          )}`,
          {
            signal: controller.signal,
          }
        );

        if (res.ok) {
          return {
            ok: true,
            provider,
            message: 'Gemini API key verified and operational.',
          };
        }

        const data = await res.json().catch(() => ({}));
        const reason =
          data?.error?.message ||
          (res.status === 400 || res.status === 403
            ? 'Invalid Gemini API key or Generative Language API not enabled.'
            : res.status === 429
            ? 'Gemini quota or rate limit exceeded (429).'
            : `Gemini returned status ${res.status}`);

        return { ok: false, provider, reason };
      }

      case 'xai': {
        const res = await fetch('https://api.x.ai/v1/models', {
          headers: {
            Authorization: `Bearer ${trimmedKey}`,
          },
          signal: controller.signal,
        });

        if (res.ok) {
          return {
            ok: true,
            provider,
            message: 'xAI Grok API key verified and operational.',
          };
        }

        const data = await res.json().catch(() => ({}));
        const reason =
          data?.error?.message ||
          (res.status === 401
            ? 'Invalid xAI API key (401 Unauthorized).'
            : res.status === 429
            ? 'xAI rate limit reached (429).'
            : `xAI returned status ${res.status}`);

        return { ok: false, provider, reason };
      }

      case 'tavily' as any: {
        const res = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            api_key: trimmedKey,
            query: 'test ping',
            max_results: 1,
          }),
          signal: controller.signal,
        });

        if (res.ok) {
          return {
            ok: true,
            provider,
            message: 'Tavily API key verified and operational.',
          };
        }

        const data = await res.json().catch(() => ({}));
        const reason =
          (res.status === 401 || res.status === 403
            ? 'Invalid Tavily key'
            : res.status === 429 || res.status === 402
            ? 'Tavily search quota reached (429/402).'
            : data?.detail?.error || data?.error || data?.message || `Tavily returned status ${res.status}`);

        return { ok: false, provider, reason };
      }

      default:
        return {
          ok: false,
          provider,
          reason: `Unknown provider: ${provider}`,
        };
    }
  } catch (err: unknown) {
    if (controller.signal.aborted) {
      return {
        ok: false,
        provider,
        reason: 'Verification timed out after 12 seconds.',
      };
    }
    const message = err instanceof Error ? err.message : 'Network error testing API key';
    return { ok: false, provider, reason: message };
  } finally {
    clearTimeout(timeoutId);
  }
}
