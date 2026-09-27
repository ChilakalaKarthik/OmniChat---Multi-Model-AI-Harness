export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchResponse {
  ok: boolean;
  query: string;
  results: SearchResultItem[];
  fallback?: boolean;
  quotaExceeded?: boolean;
  error?: string;
}

/**
 * Searches the web via Tavily Search API with a 10s timeout.
 * Returns up to 5 grounded search results.
 */
export async function searchTavily(query: string, apiKey: string): Promise<SearchResponse> {
  const trimmedQuery = query.trim();
  const trimmedKey = (apiKey || '').trim();

  if (!trimmedQuery) {
    return { ok: false, query: '', results: [] };
  }

  if (!trimmedKey) {
    return {
      ok: false,
      query: trimmedQuery,
      results: [],
      fallback: true,
      error: 'Add a Tavily key to enable web search',
    };
  }

  const controller = new AbortController();
  // 10-second timeout per Part 2 spec
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: trimmedKey,
        query: trimmedQuery,
        max_results: 5,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Check for monthly free quota exhaustion (429 or 402 responses)
    if (res.status === 429 || res.status === 402) {
      console.warn(`[Tavily] Search quota reached (HTTP ${res.status}) for query: "${trimmedQuery}"`);
      return {
        ok: false,
        query: trimmedQuery,
        results: [],
        fallback: true,
        quotaExceeded: true,
        error: 'Web search quota reached this month',
      };
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.warn(`[Tavily] API error (HTTP ${res.status}):`, errData);
      return {
        ok: false,
        query: trimmedQuery,
        results: [],
        fallback: true,
        error: 'Web search unavailable, answered from model knowledge only',
      };
    }

    const data = await res.json().catch(() => null);
    if (!data || !Array.isArray(data.results) || data.results.length === 0) {
      return {
        ok: false,
        query: trimmedQuery,
        results: [],
        fallback: true,
        error: 'Web search unavailable, answered from model knowledge only',
      };
    }

    const results: SearchResultItem[] = data.results
      .filter((item: any) => item && (item.content || item.title) && item.url)
      .slice(0, 5)
      .map((item: any) => ({
        title: String(item.title || 'Search Result').replace(/<[^>]+>/g, ''),
        url: String(item.url || ''),
        snippet: String(item.content || item.raw_content || item.snippet || '').replace(/<[^>]+>/g, ''),
      }));

    if (results.length === 0) {
      return {
        ok: false,
        query: trimmedQuery,
        results: [],
        fallback: true,
        error: 'Web search unavailable, answered from model knowledge only',
      };
    }

    return {
      ok: true,
      query: trimmedQuery,
      results,
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
      console.warn(`[Tavily] Request timed out after 10s for query: "${trimmedQuery}"`);
    } else {
      console.warn('[Tavily] Search request error:', err);
    }

    return {
      ok: false,
      query: trimmedQuery,
      results: [],
      fallback: true,
      error: 'Web search unavailable, answered from model knowledge only',
    };
  }
}
