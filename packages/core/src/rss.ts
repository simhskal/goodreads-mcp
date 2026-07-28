import type { Book, GoodreadsRssOptions } from "./types.js";
import {
  clean,
  normalizeIsbn,
  parseDate,
  parseNumber,
  stableBookId,
} from "./util.js";

const entityMap: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  quot: '"',
  nbsp: " ",
};

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(x?[0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(
        Number.parseInt(code.replace(/^x/i, ""), /^x/i.test(code) ? 16 : 10),
      ),
    )
    .replace(/&([a-z]+);/gi, (match, name: string) => entityMap[name] ?? match);
}

function tag(xml: string, name: string): string | undefined {
  const match = xml.match(
    new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"),
  );
  return match?.[1] === undefined ? undefined : clean(decodeXml(match[1]));
}

function tagOrAttribute(xml: string, name: string): string | undefined {
  const tagged = tag(xml, name);
  if (tagged) return tagged;
  const match = xml.match(
    new RegExp(`<${name}\\s[^>]*(?:url|href)=["']([^"']+)["'][^>]*/?>`, "i"),
  );
  return match?.[1] ? decodeXml(match[1]) : undefined;
}

export function parseGoodreadsRss(xml: string, shelf = "read"): Book[] {
  if (!/<(?:rss|rdf:RDF)\b/i.test(xml))
    throw new Error("Invalid Goodreads RSS document");
  const items = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) ?? [];
  return items.map((item): Book => {
    const title = tag(item, "title") ?? "Untitled";
    const author =
      tag(item, "author_name") ?? tag(item, "author") ?? "Unknown author";
    const isbn = normalizeIsbn(tag(item, "isbn"));
    const isbn13 = normalizeIsbn(tag(item, "isbn13"));
    const goodreadsBookId = clean(tag(item, "book_id"));
    const url = tag(item, "link");
    const book: Book = {
      id: "",
      title,
      author,
      shelf,
      source: "rss",
    };
    const optional: Record<string, unknown> = {
      isbn,
      isbn13,
      goodreadsBookId,
      goodreadsUrl: url,
      coverUrl:
        tagOrAttribute(item, "book_large_image_url") ??
        tagOrAttribute(item, "book_medium_image_url") ??
        tagOrAttribute(item, "book_image_url"),
      rating: parseNumber(tag(item, "user_rating")),
      averageRating: parseNumber(tag(item, "average_rating")),
      dateRead: parseDate(tag(item, "user_read_at")),
      dateAdded: parseDate(tag(item, "user_date_added")),
      dateUpdated: parseDate(tag(item, "user_date_updated")),
      dateStarted: parseDate(tag(item, "user_started_at")),
      pages: parseNumber(tag(item, "book_num_pages")),
      yearPublished: parseNumber(tag(item, "book_published")),
      review: clean(tag(item, "user_review")),
    };
    for (const [key, value] of Object.entries(optional)) {
      if (value !== undefined)
        (book as unknown as Record<string, unknown>)[key] = value;
    }
    book.id = stableBookId(book);
    return book;
  });
}

export function goodreadsRssUrl(
  options: Omit<GoodreadsRssOptions, "fetch" | "signal">,
): string {
  if (!/^\d+$/.test(options.userId))
    throw new Error("Goodreads user ID must contain only digits");
  const url = new URL(
    `https://www.goodreads.com/review/list_rss/${options.userId}`,
  );
  if (options.key) url.searchParams.set("key", options.key);
  url.searchParams.set("shelf", options.shelf ?? "read");
  if (options.limit !== undefined)
    url.searchParams.set("per_page", String(options.limit));
  return url.toString();
}

export async function fetchGoodreadsRss(
  options: GoodreadsRssOptions,
): Promise<Book[]> {
  const fetcher = options.fetch ?? globalThis.fetch;
  const response = await fetcher(goodreadsRssUrl(options), {
    headers: {
      accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8",
    },
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (!response.ok)
    throw new Error(`Goodreads RSS request failed (${response.status})`);
  return parseGoodreadsRss(await response.text(), options.shelf ?? "read");
}
