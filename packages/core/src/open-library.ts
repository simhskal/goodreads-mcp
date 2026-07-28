import type { OpenLibraryMetadata } from "./types.js";
import { normalizeIsbn } from "./util.js";

export async function fetchOpenLibraryBook(
  isbnInput: string,
  options: { fetch?: typeof globalThis.fetch; signal?: AbortSignal } = {},
): Promise<OpenLibraryMetadata | undefined> {
  const isbn = normalizeIsbn(isbnInput);
  if (!isbn) throw new Error("ISBN must be a valid ISBN-10 or ISBN-13");
  const key = `ISBN:${isbn}`;
  const url = new URL("https://openlibrary.org/api/books");
  url.searchParams.set("bibkeys", key);
  url.searchParams.set("format", "json");
  url.searchParams.set("jscmd", "data");
  const response = await (options.fetch ?? globalThis.fetch)(
    url,
    options.signal ? { signal: options.signal } : {},
  );
  if (!response.ok)
    throw new Error(`Open Library request failed (${response.status})`);
  const payload = (await response.json()) as Record<
    string,
    {
      title?: string;
      authors?: Array<{ name: string }>;
      publishers?: Array<{ name: string }>;
      publish_date?: string;
      number_of_pages?: number;
      cover?: { large?: string; medium?: string; small?: string };
      url?: string;
      identifiers?: { isbn_10?: string[]; isbn_13?: string[] };
    }
  >;
  const data = payload[key];
  if (!data) return undefined;
  const result: OpenLibraryMetadata = {};
  if (data.title) result.title = data.title;
  if (data.authors?.length)
    result.authors = data.authors.map(({ name }) => name);
  if (data.publishers?.length)
    result.publishers = data.publishers.map(({ name }) => name);
  if (data.publish_date) result.publishDate = data.publish_date;
  if (data.number_of_pages) result.pages = data.number_of_pages;
  const cover = data.cover?.large ?? data.cover?.medium ?? data.cover?.small;
  if (cover) result.coverUrl = cover;
  if (data.url)
    result.openLibraryUrl = new URL(
      data.url,
      "https://openlibrary.org",
    ).toString();
  if (data.identifiers?.isbn_10?.[0])
    result.isbn10 = data.identifiers.isbn_10[0];
  if (data.identifiers?.isbn_13?.[0])
    result.isbn13 = data.identifiers.isbn_13[0];
  return result;
}
