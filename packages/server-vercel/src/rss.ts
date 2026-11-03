import {
  goodreadsRssUrl,
  parseGoodreadsRss,
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
  if (!/^[A-Za-z0-9_-]+$/.test(shelf)) throw new Error("Invalid shelf name.");
  const cacheKey = `rss:${authUserId}:${goodreadsUserId}:${shelf}`;
  const cached = await repository.cachedShelf(cacheKey);
  if (cached) return cached;

  const response = await fetch(
    goodreadsRssUrl({ userId: goodreadsUserId, key: rssKey, shelf }),
    { headers: { "user-agent": "goodreads-mcp/0.1 (RSS reader)" } },
  );
  if (!response.ok)
    throw new Error(`Goodreads RSS returned HTTP ${response.status}.`);
  const books = parseRss(await response.text(), shelf);
  await repository.cacheShelf(cacheKey, books);
  return books;
}
