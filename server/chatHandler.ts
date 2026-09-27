import { Request, Response } from 'express';
import { ChatRequestBody, ProviderId, InternalMessage } from './providers/types';
import { streamOpenAI } from './providers/openai';
import { streamAnthropic } from './providers/anthropic';
import { streamGemini } from './providers/gemini';
import { streamXAI } from './providers/xai';
import { getDocument, findTopChunks } from './rag/documentStore';
import { searchSearXNG } from './search/searxng';

export async function handleChatStream(req: Request, res: Response): Promise<void> {
  // Set SSE Headers
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const sendSSE = (
    type:
      | 'token'
      | 'done'
      | 'error'
      | 'web_search_fallback'
      | 'web_search_sources'
      | 'web_search_status',
    data: unknown
  ) => {
    if (res.writableEnded) return;
    try {
      res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
    } catch (e) {
      console.error('[OmniChat SSE] Write error:', e);
    }
  };

  const {
    provider,
    apiKey,
    model,
    messages,
    contextChunks,
    docId,
    webSearch,
  } = (req.body || {}) as ChatRequestBody;

  // Validate inputs
  if (!provider || !apiKey || !model || !Array.isArray(messages)) {
    sendSSE('error', 'Missing required parameters: provider, apiKey, model, or messages');
    res.end();
    return;
  }

  const trimmedKey = String(apiKey).trim();
  if (!trimmedKey) {
    sendSSE('error', 'invalid_api_key');
    res.end();
    return;
  }

  const normalizedMessages: InternalMessage[] = messages.map((m) => ({
    role: m.role || 'user',
    content: String(m.content || ''),
  }));

  // Naive RAG Document Chunk Injection (Section 3 & Section 5)
  if (docId) {
    const doc = getDocument(docId);
    if (doc && doc.chunks.length > 0) {
      const latestUserQuery =
        normalizedMessages.filter((m) => m.role === 'user').slice(-1)[0]?.content || '';
      const top6Chunks = findTopChunks(doc.chunks, latestUserQuery, 6);
      const chunkContext = `[Context from uploaded document: "${doc.filename}"]\n\n${top6Chunks
        .map((c, i) => `--- Excerpt ${i + 1} ---\n${c}`)
        .join('\n\n')}\n\n[Instructions: Answer the user's question grounded in the document excerpts above. If the document doesn't contain the answer, answer based on your knowledge and clearly note that the document does not mention it.]`;

      normalizedMessages.unshift({
        role: 'system',
        content: chunkContext,
      });
    }
  } else if (Array.isArray(contextChunks) && contextChunks.length > 0) {
    const chunkContext = `[Context from uploaded document]:\n${contextChunks.join(
      '\n\n---\n\n'
    )}\n\n[End of context]`;
    normalizedMessages.unshift({
      role: 'system',
      content: chunkContext,
    });
  }

  // Phase 4: Web Search Grounding for Non-Gemini Models via SearXNG Proxy (Section 2, 3, 5, 7)
  if (webSearch && provider !== 'gemini') {
    const latestUserQuery =
      normalizedMessages.filter((m) => m.role === 'user').slice(-1)[0]?.content || '';
    if (latestUserQuery) {
      try {
        sendSSE('web_search_status', 'Waking up search service…');
        const searchResult = await searchSearXNG(latestUserQuery, (status) => {
          sendSSE('web_search_status', status);
        });
        if (searchResult.ok && searchResult.results.length > 0) {
          const searchContext = `[Web Search Grounding Results for query: "${latestUserQuery}"]\n\n${searchResult.results
            .map(
              (r, i) =>
                `--- Source ${i + 1}: ${r.title} ---\nURL: ${r.url}\nSummary: ${r.snippet}`
            )
            .join(
              '\n\n'
            )}\n\n[Instructions: Provide an accurate answer synthesizing these search results, citing the source URLs.]`;

          normalizedMessages.unshift({
            role: 'system',
            content: searchContext,
          });

          sendSSE('web_search_sources', searchResult.results);
        } else {
          // Fallback notice (Section 7 constraint)
          sendSSE(
            'web_search_fallback',
            'Web search unavailable, answered from model knowledge only'
          );
        }
      } catch {
        sendSSE(
          'web_search_fallback',
          'Web search unavailable, answered from model knowledge only'
        );
      }
    }
  }

  // 30-second server timeout controller (required by Section 7)
  const controller = new AbortController();
  let isDone = false;
  const timeoutId = setTimeout(() => {
    if (!isDone) {
      console.warn(`[OmniChat] Request timed out for provider: ${provider}, model: ${model}`);
      controller.abort();
      sendSSE('error', 'timeout');
      res.end();
    }
  }, 30000);

  // Handle client disconnect mid-stream on response close
  res.on('close', () => {
    if (!res.writableEnded && !isDone) {
      isDone = true;
      clearTimeout(timeoutId);
      controller.abort();
    }
  });

  const wrappedSendSSE = (type: 'token' | 'done' | 'error', data: unknown) => {
    if (type === 'done' || type === 'error') {
      isDone = true;
      clearTimeout(timeoutId);
    }
    sendSSE(type, data);
  };

  try {
    switch (provider as ProviderId) {
      case 'openai':
        await streamOpenAI(trimmedKey, model, normalizedMessages, wrappedSendSSE, controller.signal);
        break;

      case 'anthropic':
        await streamAnthropic(trimmedKey, model, normalizedMessages, wrappedSendSSE, controller.signal);
        break;

      case 'gemini':
        await streamGemini(trimmedKey, model, normalizedMessages, wrappedSendSSE, controller.signal, webSearch);
        break;

      case 'xai':
        await streamXAI(trimmedKey, model, normalizedMessages, wrappedSendSSE, controller.signal);
        break;

      default:
        wrappedSendSSE('error', `Unsupported provider: ${provider}`);
        break;
    }
  } catch (err: unknown) {
    if (controller.signal.aborted) {
      // Already sent timeout if aborted by timeout
      if (!isDone) {
        wrappedSendSSE('error', 'timeout');
      }
    } else {
      console.error(`[OmniChat] Error proxying to ${provider}:`, err);
      const message = err instanceof Error ? err.message : 'Unknown provider error';
      wrappedSendSSE('error', message);
    }
  } finally {
    clearTimeout(timeoutId);
    if (!res.writableEnded) {
      res.end();
    }
  }
}
