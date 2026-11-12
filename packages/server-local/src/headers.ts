export const GOODREADS_RSS_KEY_HEADER = "x-goodreads-rss-key";

export function redactRssKeyHeader(request: Request): {
  rssKey: string | undefined;
  request: Request;
} {
  if (!request.headers.has(GOODREADS_RSS_KEY_HEADER)) {
    return { rssKey: undefined, request };
  }

  const rssKey =
    request.headers.get(GOODREADS_RSS_KEY_HEADER)?.trim() || undefined;
  const headers = new Headers(request.headers);
  headers.delete(GOODREADS_RSS_KEY_HEADER);
  return {
    rssKey,
    request: new Request(request, { headers }),
  };
}
