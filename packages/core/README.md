# @organized-chaos/goodreads-mcp-core

Reusable TypeScript data primitives for reading a Goodreads library through
sanctioned Goodreads RSS feeds and Goodreads CSV exports.

This package is the data layer used by the Goodreads MCP servers. It does not
collect Goodreads passwords or session cookies, scrape Goodreads, or call
Goodreads private APIs.

Project website: [goodreads-mcp-chi.vercel.app](https://goodreads-mcp-chi.vercel.app/)

## Install

```sh
npm install @organized-chaos/goodreads-mcp-core
```

Node.js 20 or newer is required. The package is ESM-only.

## Quick start

Fetch a shelf from Goodreads RSS and query it:

```ts
import {
  fetchGoodreadsRss,
  getReadingList,
  createLibrary,
} from "@organized-chaos/goodreads-mcp-core";

const books = await fetchGoodreadsRss({
  userId: "12345678",
  key: process.env.GOODREADS_RSS_KEY,
  shelf: "read",
});

const library = createLibrary(books);
const recentBooks = getReadingList(library, "read", 10);
```

The RSS key is optional for public feeds. Treat it like a password: keep it in
local secret configuration and never log or commit it.

## Import a complete library

Goodreads RSS feeds may contain only roughly the most recent 100 books on a
shelf. For complete history, export your library from Goodreads and parse the
CSV locally:

```ts
import { readFile } from "node:fs/promises";
import {
  createLibrary,
  parseGoodreadsCsv,
  readingStats,
} from "@organized-chaos/goodreads-mcp-core";

const csv = await readFile("./goodreads_library.csv", "utf8");
const library = createLibrary(parseGoodreadsCsv(csv));

console.log(readingStats(library, 2025));
```

When RSS and CSV books are merged with `createLibrary`, duplicate books are
deduplicated by Goodreads book ID or ISBN. CSV fields such as reviews are
preserved when an RSS record is fresher but less complete.

## Public API

### Data sources

- `fetchGoodreadsRss(options)` — fetch and parse a Goodreads shelf feed.
- `goodreadsRssUrl(options)` — build a Goodreads RSS URL without making a
  request.
- `parseGoodreadsRss(xml, shelf?)` — parse RSS XML already held in memory.
- `parseGoodreadsCsv(csv)` — parse a Goodreads library export.
- `fetchOpenLibraryBook(isbn, options?)` — optionally enrich a book with Open
  Library metadata.

### Library operations

- `createLibrary(...collections)` — merge one or more `Book[]` collections into
  a deduplicated `Library`.
- `listShelves(library)`
- `getReadingList(library, shelf, limit?)`
- `getCurrentlyReading(library, limit?)`
- `getRecentlyRead(library, limit?)`
- `searchLibrary(library, query, limit?)`
- `getBook(library, { isbn?, title? })`
- `readingStats(library, year?)`

### RSS-backed service

`GoodreadsRssLibraryService` provides the same library operations over RSS and
caches concurrent requests for each shelf during the lifetime of the service:

```ts
import { GoodreadsRssLibraryService } from "@organized-chaos/goodreads-mcp-core";

const service = new GoodreadsRssLibraryService({
  userId: "12345678",
  rssKey: process.env.GOODREADS_RSS_KEY,
});

const currentlyReading = await service.getCurrentlyReading(10);
```

## Data model

The package exports the `Book`, `Library`, `ReadingStats`,
`OpenLibraryMetadata`, `GoodreadsRssOptions`, and `GoodreadsLibraryConfig`
types. `Book.source` is either `"rss"` or `"csv"`.

## Privacy and limitations

- Goodreads credentials are not accepted by this package. Use an RSS key, not
  a Goodreads password or session cookie.
- Goodreads RSS is a live, shelf-scoped source with a roughly 100-item limit.
- CSV import is manual and is the supported path for complete library history.
- Open Library is used only for optional ISBN metadata enrichment.
- RSS keys can appear in request URLs. Do not log generated URLs or full error
  objects that may contain them.

## License

MIT
