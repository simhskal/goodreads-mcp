import {
  fetchTextBounded,
  goodreadsRssUrl,
  parseGoodreadsRss,
  RSS_MAX_BYTES,
} from "@organized-chaos/goodreads-mcp-core";
import { fromCoreBook } from "./csv.js";
import type { LibraryRepository } from "./repository.js";
import type { StoredBook } from "./types.js";

export function parseRss(xml: string, shelf: string): StoredBook[] {
  return parseGoodreadsRss(xml, shelf).map(fromCoreBook);
}

export async function fetchShelf(
  repository: LibraryRepository,
  authUserId: string,
  goodreadsUserId: string,
  rssKey: string | undefined,
  shelf: string,
): Promise<StoredBook[]> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(shelf))
    throw new Error("Invalid shelf name.");
  const cacheKey = `rss:${authUserId}:${goodreadsUserId}:${shelf}`;
  const cached = await repository.cachedShelf(cacheKey);
  if (cached) return cached;

  const response = await fetchTextBounded(
    goodreadsRssUrl({ userId: goodreadsUserId, key: rssKey, shelf }),
    {
      allowedHosts: ["goodreads.com"],
      maxBytes: RSS_MAX_BYTES,
      headers: {
        accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8",
        "user-agent": "goodreads-mcp/0.1 (RSS reader)",
      },
    },
  );
  if (!response.ok)
    throw new Error(`Goodreads RSS returned HTTP ${response.status}.`);
  const books = parseRss(response.text, shelf);
  await repository.cacheShelf(cacheKey, books);
  return books;
}
