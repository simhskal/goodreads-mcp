import {
  parseGoodreadsCsv as parseCoreCsv,
  type Book,
} from "@goodreads-mcp/core";
import type { StoredBook } from "./types.js";

export { parseGoodreadsCsv };

function parseGoodreadsCsv(input: string): StoredBook[] {
  return parseCoreCsv(input).map(fromCoreBook);
}

export function fromCoreBook(book: Book): StoredBook {
  return {
    goodreadsId: book.goodreadsBookId,
    title: book.title,
    author: book.author,
    isbn: book.isbn,
    isbn13: book.isbn13,
    shelf: book.shelf,
    rating: book.rating,
    averageRating: book.averageRating,
    dateRead: book.dateRead,
    dateAdded: book.dateAdded,
    review: book.review,
    source: book.source,
  };
}
