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
  error?: string;
  devFailureReason?: 'connection_timeout' | 'http_error' | 'zero_results' | 'network_error';
}

const PUBLIC_INSTANCES = [
  'https://searx.be',
  'https://searx.tiekoetter.com',
  'https://search.ononoki.org',
  'https://searx.fmac.xyz',
  'https://priv.au',
];

interface AttemptResult {
  ok: boolean;
  results: SearchResultItem[];
  reason?: 'connection_timeout' | 'http_error' | 'zero_results' | 'network_error';
  details?: string;
}

/**
 * Executes a single fetch attempt against a SearXNG instance with a 55-second timeout
 * and distinguishes the root failure reason in dev-only console logs.
 */
async function fetchSearXNGAttempt(
  targetInstance: string,
  query: string,
  attemptNum: number
): Promise<AttemptResult> {
  const controller = new AbortController();
  let didTimeout = false;
  // 55-second timeout (accommodates Render free-tier services waking from sleep)
  const timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, 55000);

  const cleanBase = targetInstance.replace(/\/+$/, '');
  const targetUrl = `${cleanBase}/search?q=${encodeURIComponent(
    query
  )}&format=json&language=en&categories=general`;

  try {
    const res = await fetch(targetUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'OmniChat/1.0',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Distinguish HTTP error status
    if (!res.ok) {
      console.warn(
        `[SearXNG Dev Log] Attempt ${attemptNum}/3 failed: HTTP error status ${res.status} (${res.statusText}) from ${targetUrl}`
      );
      return {
        ok: false,
        results: [],
        reason: 'http_error',
        details: `HTTP ${res.status} ${res.statusText}`,
      };
    }

    const data = await res.json().catch(() => null);

    // Distinguish connected fine but returned zero results
    if (!data || !Array.isArray(data.results) || data.results.length === 0) {
      console.warn(
        `[SearXNG Dev Log] Attempt ${attemptNum}/3 completed with HTTP 200 OK but returned zero results for query: "${query}" (${targetUrl})`
      );
      return {
        ok: false,
        results: [],
        reason: 'zero_results',
        details: 'Connected fine (HTTP 200) but returned 0 results',
      };
    }

    const cleanResults: SearchResultItem[] = data.results
      .filter((item: any) => item && (item.content || item.title) && item.url)
      .slice(0, 5)
      .map((item: any) => ({
        title: String(item.title || 'Search Result').replace(/<[^>]+>/g, ''),
        url: String(item.url || ''),
        snippet: String(item.content || item.snippet || '').replace(/<[^>]+>/g, ''),
      }));

    if (cleanResults.length === 0) {
      console.warn(
        `[SearXNG Dev Log] Attempt ${attemptNum}/3 completed with HTTP 200 OK but all items lacked content/URLs for query: "${query}"`
      );
      return {
        ok: false,
        results: [],
        reason: 'zero_results',
        details: 'Connected fine (HTTP 200) but 0 valid items after parsing',
      };
    }

    return {
      ok: true,
      results: cleanResults,
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);

    // Distinguish connection timeout (55 seconds)
    if (didTimeout || (err instanceof Error && err.name === 'AbortError')) {
      console.warn(
        `[SearXNG Dev Log] Attempt ${attemptNum}/3 failed: Connection timeout after 55s waiting for service to wake up at ${targetUrl}`
      );
      return {
        ok: false,
        results: [],
        reason: 'connection_timeout',
        details: 'Connection timed out after 55 seconds',
      };
    }

    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[SearXNG Dev Log] Attempt ${attemptNum}/3 failed: Network/connection error "${errMsg}" at ${targetUrl}`
    );
    return {
      ok: false,
      results: [],
      reason: 'network_error',
      details: errMsg,
    };
  }
}

/**
 * Searches SearXNG for query with 55s timeout, 3 attempts total,
 * 5s wait after attempt 1, 10s wait after attempt 2, status reporting,
 * and dev console logs distinguishing failure reasons.
 */
export async function searchSearXNG(
  query: string,
  onStatusUpdate?: (status: string) => void
): Promise<SearchResponse> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { ok: false, query: '', results: [] };
  }

  const primaryUrl = process.env.SEARXNG_URL || process.env.SEARXNG_INSTANCE_URL;
  const instances = primaryUrl ? [primaryUrl, ...PUBLIC_INSTANCES] : PUBLIC_INSTANCES;

  // Initial status notification: distinct from final "Web search unavailable"
  onStatusUpdate?.('Waking up search service…');

  let lastFailureReason: AttemptResult['reason'] = 'network_error';

  // Three attempts total
  for (let attempt = 1; attempt <= 3; attempt++) {
    // Delays before retrying:
    // Attempt 1: immediate
    // Attempt 2: wait 5 seconds
    // Attempt 3: wait 10 seconds
    if (attempt === 2) {
      onStatusUpdate?.('Waking up search service…');
      await new Promise((resolve) => setTimeout(resolve, 5000));
    } else if (attempt === 3) {
      onStatusUpdate?.('Waking up search service…');
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }

    // Pick target instance: prefer configured primary or cycle
    const targetInstance = primaryUrl || instances[(attempt - 1) % instances.length];

    const result = await fetchSearXNGAttempt(targetInstance, trimmed, attempt);

    if (result.ok && result.results.length > 0) {
      return {
        ok: true,
        query: trimmed,
        results: result.results,
      };
    }

    lastFailureReason = result.reason || 'network_error';
  }

  console.warn(
    `[SearXNG Dev Log] All 3 attempts exhausted for query "${trimmed}". Root cause: ${lastFailureReason}. Falling back to ungrounded model knowledge.`
  );

  return {
    ok: false,
    query: trimmed,
    results: [],
    fallback: true,
    devFailureReason: lastFailureReason,
    error: 'Web search unavailable, answered from model knowledge only',
  };
}
