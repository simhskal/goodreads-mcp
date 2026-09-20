import type { Book, Library, ReadingBrief, ReadingStats } from "./types.js";

function identity(book: Book): string {
  return (
    book.goodreadsBookId ??
    book.isbn13 ??
    book.isbn ??
    `${book.title}\0${book.author}`.toLowerCase()
  );
}

export function createLibrary(...collections: Book[][]): Library {
  const merged = new Map<string, Book>();
  for (const book of collections.flat()) {
    const key = identity(book);
    const previous = merged.get(key);
    // CSV is authoritative for full-history fields; RSS contributes fresher live state.
    merged.set(
      key,
      previous
        ? {
            ...previous,
            ...book,
            ...(book.source === "rss" && previous.source === "csv"
              ? { review: previous.review, source: "csv" as const }
              : {}),
          }
        : book,
    );
  }
  const books = [...merged.values()];
  return {
    books,
    shelves: [
      ...new Set(
        books.flatMap((book) =>
          [book.shelf, book.exclusiveShelf, ...(book.shelves ?? [])].filter(
            (v): v is string => Boolean(v),
          ),
        ),
      ),
    ].sort(),
    updatedAt: new Date().toISOString(),
  };
}

export function listShelves(library: Library): string[] {
  return [...library.shelves];
}

export function getReadingList(
  library: Library,
  shelf: string,
  limit = 100,
): Book[] {
  if (!Number.isInteger(limit) || limit < 0)
    throw new Error("limit must be a non-negative integer");
  return library.books
    .filter(
      (book) =>
        book.shelf === shelf ||
        book.exclusiveShelf === shelf ||
        book.shelves?.includes(shelf),
    )
    .sort((a, b) =>
      (b.dateRead ?? b.dateAdded ?? "").localeCompare(
        a.dateRead ?? a.dateAdded ?? "",
      ),
    )
    .slice(0, limit);
}

export function getCurrentlyReading(library: Library, limit = 100): Book[] {
  return getReadingList(library, "currently-reading", limit);
}

export function getRecentlyRead(library: Library, limit = 10): Book[] {
  return library.books
    .filter((book) => book.dateRead)
    .sort((a, b) => b.dateRead!.localeCompare(a.dateRead!))
    .slice(0, limit);
}

export function searchLibrary(
  library: Library,
  query: string,
  limit = 20,
): Book[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return library.books
    .map((book) => {
      const text = [
        book.title,
        book.author,
        ...(book.additionalAuthors ?? []),
        book.isbn,
        book.isbn13,
        book.shelf,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();
      return {
        book,
        score: terms.reduce(
          (score, term) => score + (text.includes(term) ? 1 : 0),
          0,
        ),
      };
    })
    .filter(({ score }) => score === terms.length)
    .sort(
      (a, b) => b.score - a.score || a.book.title.localeCompare(b.book.title),
    )
    .slice(0, limit)
    .map(({ book }) => book);
}

export function getBook(
  library: Library,
  lookup: { isbn?: string; title?: string },
): Book | undefined {
  const isbn = lookup.isbn?.replace(/[^0-9Xx]/g, "").toUpperCase();
  const title = lookup.title?.trim().toLocaleLowerCase();
  return library.books.find(
    (book) =>
      (isbn && (book.isbn === isbn || book.isbn13 === isbn)) ||
      (title && book.title.toLocaleLowerCase() === title),
  );
}

export function readingStats(library: Library, year?: number): ReadingStats {
  const read = library.books.filter((book) => {
    if (!book.dateRead) return false;
    return (
      year === undefined || new Date(book.dateRead).getUTCFullYear() === year
    );
  });
  const rated = read.filter(
    (book) => book.rating !== undefined && book.rating > 0,
  );
  const counts = new Map<string, number>();
  for (const book of read)
    counts.set(book.author, (counts.get(book.author) ?? 0) + 1);
  const stats: ReadingStats = {
    booksRead: read.length,
    pagesRead: read.reduce((total, book) => total + (book.pages ?? 0), 0),
    ratedBooks: rated.length,
    booksPerMonth: Array.from({ length: 12 }, () => 0),
    authors: counts.size,
    topAuthors: [...counts]
      .map(([author, count]) => ({ author, count }))
      .sort((a, b) => b.count - a.count || a.author.localeCompare(b.author))
      .slice(0, 10),
  };
  if (year !== undefined) stats.year = year;
  if (rated.length)
    stats.averageRating =
      rated.reduce((sum, book) => sum + book.rating!, 0) / rated.length;
  for (const book of read)
    stats.booksPerMonth[new Date(book.dateRead!).getUTCMonth()]!++;
  return stats;
}

function briefBook(
  book: Book,
): Pick<Book, "title" | "author" | "rating" | "dateRead"> {
  return {
    title: book.title,
    author: book.author,
    ...(book.rating === undefined ? {} : { rating: book.rating }),
    ...(book.dateRead === undefined ? {} : { dateRead: book.dateRead }),
  };
}

/**
 * Produces fact-only copy that a reader can share as-is or ask their MCP
 * client to edit. Keeping this deterministic avoids inventing meaning from a
 * person's private reading history.
 */
export function readingBrief(library: Library, year?: number): ReadingBrief {
  const stats = readingStats(library, year);
  const read = library.books
    .filter((book) => {
      if (!book.dateRead) return false;
      return (
        year === undefined || new Date(book.dateRead).getUTCFullYear() === year
      );
    })
    .sort((a, b) => b.dateRead!.localeCompare(a.dateRead!));
  const favoriteBooks = [...read]
    .filter((book) => (book.rating ?? 0) > 0)
    .sort(
      (a, b) =>
        (b.rating ?? 0) - (a.rating ?? 0) ||
        b.dateRead!.localeCompare(a.dateRead!),
    )
    .slice(0, 3)
    .map(briefBook);
  const recentBooks = read.slice(0, 3).map(briefBook);
  const label = year ?? "Reading";
  const topAuthor = stats.topAuthors[0];
  const favorites = favoriteBooks.length
    ? favoriteBooks
        .map(
          (book) =>
            `- *${book.title}* by ${book.author}${book.rating ? ` — ${book.rating}/5` : ""}`,
        )
        .join("\n")
    : "- Add ratings on Goodreads to surface your favorites here.";
  const recent = recentBooks.length
    ? recentBooks
        .map((book) => `- *${book.title}* by ${book.author}`)
        .join("\n")
    : "- No finished books yet.";

  return {
    title: `${label} Reading Brief`,
    ...(year === undefined ? {} : { year }),
    stats,
    favoriteBooks,
    recentBooks,
    markdown: [
      `# ${label} Reading Brief`,
      "",
      `I finished ${stats.booksRead} book${stats.booksRead === 1 ? "" : "s"}${stats.pagesRead ? ` and ${stats.pagesRead.toLocaleString()} pages` : ""}.`,
      stats.averageRating
        ? `My average rating was ${stats.averageRating.toFixed(1)}/5 across ${stats.ratedBooks} rated book${stats.ratedBooks === 1 ? "" : "s"}.`
        : "I have not rated any finished books yet.",
      topAuthor
        ? `The author I returned to most was ${topAuthor.author} (${topAuthor.count} books).`
        : "",
      "",
      "## Favorites",
      favorites,
      "",
      "## Most recent",
      recent,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}
