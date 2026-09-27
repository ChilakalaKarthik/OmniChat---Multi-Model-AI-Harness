import { InternalMessage, SSECallback } from './types';

export async function streamGemini(
  apiKey: string,
  model: string,
  messages: InternalMessage[],
  sendSSE: SSECallback,
  signal: AbortSignal,
  webSearch?: boolean
): Promise<void> {
  // Normalize model name (remove 'models/' prefix if user or UI passed it)
  const cleanModel = model.replace(/^models\//, '');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:streamGenerateContent?key=${apiKey}&alt=sse`;

  const contents: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];
  const systemParts: { text: string }[] = [];

  for (const m of messages) {
    if (m.role === 'system') {
      systemParts.push({ text: m.content });
    } else {
      contents.push({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      });
    }
  }

  if (contents.length === 0) {
    contents.push({ role: 'user', parts: [{ text: 'Hello' }] });
  }

  const requestBody: Record<string, unknown> = {
    contents,
  };

  if (systemParts.length > 0) {
    requestBody.systemInstruction = { parts: systemParts };
  }

  // Google Search grounding tool if webSearch is enabled
  if (webSearch) {
    requestBody.tools = [{ google_search: {} }];
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
    signal,
  });

  if (!response.ok) {
    if (response.status === 429) {
      sendSSE('error', 'rate_limited');
      return;
    }
    if (response.status === 400 || response.status === 403) {
      const errText = await response.text().catch(() => '');
      if (errText.includes('API_KEY_INVALID') || errText.includes('API key not valid')) {
        sendSSE('error', 'invalid_api_key');
        return;
      }
      try {
        const parsed = JSON.parse(errText);
        sendSSE('error', parsed.error?.message || `Gemini error: HTTP ${response.status}`);
      } catch {
        sendSSE('error', `Gemini error: HTTP ${response.status}`);
      }
      return;
    }
    if (response.status >= 500) {
      sendSSE('error', 'server_error');
      return;
    }
    const errText = await response.text().catch(() => '');
    try {
      const parsed = JSON.parse(errText);
      sendSSE('error', parsed.error?.message || `Gemini error: HTTP ${response.status}`);
    } catch {
      sendSSE('error', `Gemini error: HTTP ${response.status}`);
    }
    return;
  }

  if (!response.body) {
    sendSSE('error', 'No response body received from Gemini');
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
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
            const json = JSON.parse(trimmed.slice(6));
            const parts = json.candidates?.[0]?.content?.parts;
            if (Array.isArray(parts)) {
              for (const part of parts) {
                if (part.text) {
                  sendSSE('token', part.text);
                }
              }
            }
          } catch {
            // Partial JSON
          }
        }
      }
    }

    if (buffer.trim().startsWith('data: ')) {
      try {
        const json = JSON.parse(buffer.trim().slice(6));
        const parts = json.candidates?.[0]?.content?.parts;
        if (Array.isArray(parts)) {
          for (const part of parts) {
            if (part.text) {
              sendSSE('token', part.text);
            }
          }
        }
      } catch {
        // ignore
      }
    }

    sendSSE('done', null);
  } finally {
    reader.releaseLock();
  }
}
