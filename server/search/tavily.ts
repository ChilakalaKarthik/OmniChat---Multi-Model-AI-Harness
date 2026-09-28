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
async function searchPublicFallback(query: string): Promise<SearchResponse> {
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    if (res.ok) {
      const html = await res.text();
      const results: SearchResultItem[] = [];
      const resultBlocks = html.split(/class="result\s+results_links/g).slice(1);

      for (const block of resultBlocks) {
        if (results.length >= 5) break;
        const titleMatch = block.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
        const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i) || block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/div>/i);

        if (titleMatch) {
          let rawUrl = titleMatch[1];
          if (rawUrl.includes('uddg=')) {
            const urlParam = rawUrl.split('uddg=')[1]?.split('&')[0];
            if (urlParam) rawUrl = decodeURIComponent(urlParam);
          }
          const title = titleMatch[2].replace(/<[^>]+>/g, '').trim();
          const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : title;

          if (title && rawUrl.startsWith('http')) {
            results.push({ title, url: rawUrl, snippet });
          }
        }
      }

      if (results.length > 0) {
        return { ok: true, query, results };
      }
    }
  } catch (err) {
    console.warn('[PublicSearch] DuckDuckGo fallback error:', err);
  }

  // Wikipedia fallback
  try {
    const wikiRes = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`);
    if (wikiRes.ok) {
      const wikiData = await wikiRes.json();
      if (wikiData?.query?.search && Array.isArray(wikiData.query.search)) {
        const wikiResults: SearchResultItem[] = wikiData.query.search.slice(0, 5).map((item: any) => ({
          title: item.title,
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`,
          snippet: item.snippet.replace(/<[^>]+>/g, '').trim(),
        }));
        if (wikiResults.length > 0) {
          return { ok: true, query, results: wikiResults };
        }
      }
    }
  } catch (wikiErr) {
    console.warn('[PublicSearch] Wikipedia fallback error:', wikiErr);
  }

  return {
    ok: false,
    query,
    results: [],
    fallback: true,
    error: 'No search results found for this query',
  };
}

export async function searchTavily(query: string, apiKey: string): Promise<SearchResponse> {
  const trimmedQuery = query.trim();
  const trimmedKey = (apiKey || '').trim();

  if (!trimmedQuery) {
    return { ok: false, query: '', results: [] };
  }

  if (!trimmedKey) {
    return searchPublicFallback(trimmedQuery);
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
