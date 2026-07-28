import type { Book } from "./types.js";
import {
  clean,
  normalizeIsbn,
  parseDate,
  parseNumber,
  stableBookId,
} from "./util.js";

function rows(input: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < input.length; index++) {
    const char = input[index]!;
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      result.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (quoted) throw new Error("Invalid CSV: unterminated quoted field");
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    result.push(row);
  }
  return result;
}

export function parseGoodreadsCsv(input: string): Book[] {
  const parsed = rows(input.replace(/^\uFEFF/, ""));
  const headers = parsed.shift()?.map((header) => header.trim());
  if (!headers?.includes("Title") || !headers.includes("Author")) {
    throw new Error("Invalid Goodreads CSV: expected Title and Author columns");
  }
  return parsed
    .filter((row) => row.some(Boolean))
    .map((row): Book => {
      const record = Object.fromEntries(
        headers.map((header, index) => [header, row[index] ?? ""]),
      );
      const title = clean(record["Title"]) ?? "Untitled";
      const author = clean(record["Author"]) ?? "Unknown author";
      const isbn = normalizeIsbn(record["ISBN"]);
      const isbn13 = normalizeIsbn(record["ISBN13"]);
      const goodreadsBookId = clean(record["Book Id"]);
      const shelves = (record["Bookshelves"] ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const exclusiveShelf = clean(record["Exclusive Shelf"]);
      const shelf = exclusiveShelf ?? shelves[0] ?? "read";
      const book: Book = { id: "", title, author, shelf, source: "csv" };
      const optional: Record<string, unknown> = {
        additionalAuthors: clean(record["Additional Authors"])
          ?.split(",")
          .map((v) => v.trim())
          .filter(Boolean),
        shelves: [...new Set([shelf, ...shelves])],
        isbn,
        isbn13,
        goodreadsBookId,
        exclusiveShelf,
        rating: parseNumber(record["My Rating"]),
        averageRating: parseNumber(record["Average Rating"]),
        publisher: clean(record["Publisher"]),
        binding: clean(record["Binding"]),
        pages: parseNumber(record["Number of Pages"]),
        yearPublished: parseNumber(
          record["Year Published"] || record["Original Publication Year"],
        ),
        dateRead: parseDate(record["Date Read"]),
        dateAdded: parseDate(record["Date Added"]),
        review: clean(record["My Review"]),
        readCount: parseNumber(record["Read Count"]),
        ownedCopies: parseNumber(record["Owned Copies"]),
      };
      for (const [key, value] of Object.entries(optional)) {
        if (value !== undefined)
          (book as unknown as Record<string, unknown>)[key] = value;
      }
      book.id = stableBookId(book);
      return book;
    });
}
