import {
  goodreadsRssUrl,
  parseGoodreadsRss,
} from "@organized-chaos/goodreads-mcp-core";
import { fromCoreBook } from "./csv.js";
import type { StoredBook } from "./types.js";

export function parseRss(xml: string, shelf: string): StoredBook[] {
  return parseGoodreadsRss(xml, shelf).map(fromCoreBook);
}

export async function fetchShelf(
  cache: KVNamespace,
  goodreadsUserId: string,
  rssKey: string | null,
  shelf: string,
): Promise<StoredBook[]> {
  if (!/^[A-Za-z0-9_-]+$/.test(shelf)) throw new Error("Invalid shelf name.");
  const cacheKey = `rss:${goodreadsUserId}:${shelf}`;
  const cached = await cache.get(cacheKey, "json");
  if (Array.isArray(cached)) return cached as StoredBook[];
  const url = goodreadsRssUrl({
    userId: goodreadsUserId,
    key: rssKey ?? undefined,
    shelf,
  });
  const response = await fetch(url, {
    headers: { "user-agent": "goodreads-mcp/0.1 (RSS reader)" },
  });
  if (!response.ok)
    throw new Error(`Goodreads RSS returned HTTP ${response.status}.`);
  const books = parseRss(await response.text(), shelf);
  await cache.put(cacheKey, JSON.stringify(books), { expirationTtl: 900 });
  return books;
}
