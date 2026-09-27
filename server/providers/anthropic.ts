import { InternalMessage, SSECallback } from './types';

export async function streamAnthropic(
  apiKey: string,
  model: string,
  messages: InternalMessage[],
  sendSSE: SSECallback,
  signal: AbortSignal
): Promise<void> {
  const url = 'https://api.anthropic.com/v1/messages';

  // Extract any system messages for top-level system parameter
  const systemTexts: string[] = [];
  const conversationMessages: { role: 'user' | 'assistant'; content: string }[] = [];

  for (const m of messages) {
    if (m.role === 'system') {
      systemTexts.push(m.content);
    } else {
      conversationMessages.push({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      });
    }
  }

  // Ensure messages alternate and don't start with assistant
  const sanitizedMessages: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of conversationMessages) {
    if (sanitizedMessages.length === 0 && m.role === 'assistant') {
      continue; // Skip leading assistant message
    }
    const last = sanitizedMessages[sanitizedMessages.length - 1];
    if (last && last.role === m.role) {
      last.content += `\n\n${m.content}`;
    } else {
      sanitizedMessages.push({ role: m.role, content: m.content });
    }
  }

  if (sanitizedMessages.length === 0) {
    sanitizedMessages.push({ role: 'user', content: 'Hello' });
  }

  const requestBody: Record<string, unknown> = {
    model,
    max_tokens: 4096,
    messages: sanitizedMessages,
    stream: true,
  };

  if (systemTexts.length > 0) {
    requestBody.system = systemTexts.join('\n\n');
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(requestBody),
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
      sendSSE('error', parsed.error?.message || `Anthropic error: HTTP ${response.status}`);
    } catch {
      sendSSE('error', `Anthropic error: HTTP ${response.status}`);
    }
    return;
  }

  if (!response.body) {
    sendSSE('error', 'No response body received from Anthropic');
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
            if (json.type === 'content_block_delta') {
              const deltaText = json.delta?.text;
              if (deltaText) {
                sendSSE('token', deltaText);
              }
            } else if (json.type === 'message_stop') {
              sendSSE('done', null);
              return;
            } else if (json.type === 'error') {
              sendSSE('error', json.error?.message || 'Anthropic stream error');
              return;
            }
          } catch {
            // Partial JSON
          }
        }
      }
    }

    sendSSE('done', null);
  } finally {
    reader.releaseLock();
  }
}
