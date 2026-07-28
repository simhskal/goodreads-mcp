export type BookSource = "rss" | "csv";

export interface Book {
  id: string;
  title: string;
  author: string;
  additionalAuthors?: string[];
  isbn?: string;
  isbn13?: string;
  goodreadsBookId?: string;
  goodreadsUrl?: string;
  coverUrl?: string;
  shelf: string;
  shelves?: string[];
  exclusiveShelf?: string;
  rating?: number;
  averageRating?: number;
  dateRead?: string;
  dateAdded?: string;
  dateUpdated?: string;
  dateStarted?: string;
  pages?: number;
  yearPublished?: number;
  publisher?: string;
  binding?: string;
  review?: string;
  readCount?: number;
  ownedCopies?: number;
  source: BookSource;
}

export interface Library {
  books: Book[];
  shelves: string[];
  updatedAt: string;
}

export interface ReadingStats {
  year?: number;
  booksRead: number;
  pagesRead: number;
  ratedBooks: number;
  averageRating?: number;
  booksPerMonth: number[];
  authors: number;
  topAuthors: Array<{ author: string; count: number }>;
}

export interface OpenLibraryMetadata {
  title?: string;
  authors?: string[];
  publishers?: string[];
  publishDate?: string;
  pages?: number;
  coverUrl?: string;
  openLibraryUrl?: string;
  isbn10?: string;
  isbn13?: string;
}

export interface GoodreadsRssOptions {
  userId: string;
  key?: string;
  shelf?: string;
  limit?: number;
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
}
