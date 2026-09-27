import { InternalMessage, SSECallback } from './types';

export async function streamXAI(
  apiKey: string,
  model: string,
  messages: InternalMessage[],
  sendSSE: SSECallback,
  signal: AbortSignal
): Promise<void> {
  const url = 'https://api.x.ai/v1/chat/completions';

  const formattedMessages = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: formattedMessages,
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    if (response.status === 429) {
      sendSSE('error', 'rate_limited');
      return;
    }
    if (response.status === 401 || response.status === 403) {
      sendSSE('error', 'invalid_api_key');
      return;
    }
    if (response.status >= 500) {
      sendSSE('error', 'server_error');
      return;
    }
    const errText = await response.text().catch(() => '');
    try {
      const parsed = JSON.parse(errText);
      sendSSE('error', parsed.error?.message || `xAI error: HTTP ${response.status}`);
    } catch {
      sendSSE('error', `xAI error: HTTP ${response.status}`);
    }
    return;
  }

  if (!response.body) {
    sendSSE('error', 'No response body received from xAI');
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

        if (trimmed === 'data: [DONE]') {
          sendSSE('done', null);
          return;
        }

        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6));
            const token = json.choices?.[0]?.delta?.content;
            if (token) {
              sendSSE('token', token);
            }
          } catch {
            // Partial JSON
          }
        }
      }
    }

    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed === 'data: [DONE]') {
        sendSSE('done', null);
        return;
      }
      if (trimmed.startsWith('data: ')) {
        try {
          const json = JSON.parse(trimmed.slice(6));
          const token = json.choices?.[0]?.delta?.content;
          if (token) {
            sendSSE('token', token);
          }
        } catch {
          // ignore
        }
      }
    }

    sendSSE('done', null);
  } finally {
    reader.releaseLock();
  }
}
