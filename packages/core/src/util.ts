export function clean(value: string | undefined): string | undefined {
  const result = value?.trim();
  return result ? result : undefined;
}

export function parseNumber(value: string | undefined): number | undefined {
  const normalized = clean(value);
  if (!normalized) return undefined;
  const result = Number(normalized.replace(/,/g, ""));
  return Number.isFinite(result) ? result : undefined;
}

export function parseDate(value: string | undefined): string | undefined {
  const normalized = clean(value);
  if (!normalized || normalized.toLowerCase() === "not set") return undefined;
  const timestamp = Date.parse(normalized);
  return Number.isNaN(timestamp)
    ? undefined
    : new Date(timestamp).toISOString();
}

export function normalizeIsbn(value: string | undefined): string | undefined {
  const normalized = value?.replace(/[^0-9Xx]/g, "").toUpperCase();
  return normalized && (normalized.length === 10 || normalized.length === 13)
    ? normalized
    : undefined;
}

export function stableBookId(book: {
  goodreadsBookId?: string;
  isbn13?: string;
  isbn?: string;
  title: string;
  author: string;
}): string {
  if (book.goodreadsBookId) return `goodreads:${book.goodreadsBookId}`;
  if (book.isbn13) return `isbn:${book.isbn13}`;
  if (book.isbn) return `isbn:${book.isbn}`;
  return `book:${slug(`${book.title}-${book.author}`)}`;
}

export function slug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
