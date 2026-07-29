import { fetchGoodreadsRss } from "./rss.js";
import {
  createLibrary,
  getBook,
  getCurrentlyReading,
  getReadingList,
  getRecentlyRead,
  listShelves,
  readingStats,
  searchLibrary,
} from "./library.js";
import { fetchOpenLibraryBook } from "./open-library.js";
import type { Book, GoodreadsRssOptions, Library } from "./types.js";

export interface GoodreadsLibraryConfig {
  userId: string;
  rssKey?: string;
}

export class GoodreadsRssLibraryService {
  readonly #rssOptions: Pick<GoodreadsRssOptions, "userId" | "key">;
  readonly #cache = new Map<string, Promise<Book[]>>();

  constructor(config: GoodreadsLibraryConfig) {
    this.#rssOptions = {
      userId: config.userId,
      ...(config.rssKey ? { key: config.rssKey } : {}),
    };
  }

  async #books(shelf?: string): Promise<Book[]> {
    const key = shelf ?? "";
    let pending = this.#cache.get(key);
    if (!pending) {
      pending = fetchGoodreadsRss({
        ...this.#rssOptions,
        ...(shelf ? { shelf } : {}),
        limit: 100,
      }).catch((error) => {
        this.#cache.delete(key);
        throw error;
      });
      this.#cache.set(key, pending);
    }
    return pending;
  }

  async #library(shelf?: string): Promise<Library> {
    return createLibrary(await this.#books(shelf));
  }

  async listShelves(): Promise<string[]> {
    return listShelves(await this.#library());
  }

  async getReadingList(shelf: string, limit: number): Promise<Book[]> {
    return getReadingList(await this.#library(shelf), shelf, limit);
  }

  async getCurrentlyReading(limit: number): Promise<Book[]> {
    return getCurrentlyReading(await this.#library("currently-reading"), limit);
  }

  async getRecentlyRead(limit: number): Promise<Book[]> {
    return getRecentlyRead(await this.#library("read"), limit);
  }

  async readingStats(year?: number) {
    return readingStats(await this.#library("read"), year);
  }

  async searchLibrary(query: string, limit: number): Promise<Book[]> {
    return searchLibrary(await this.#library(), query, limit);
  }

  async getBook(lookup: { isbn?: string; title?: string }) {
    const book = getBook(await this.#library(), lookup);
    const isbn = lookup.isbn ?? book?.isbn13 ?? book?.isbn;
    if (!isbn) return book;

    const metadata = await fetchOpenLibraryBook(isbn);
    if (!book) return metadata;
    if (!metadata) return book;

    return {
      ...metadata,
      ...book,
      openLibrary: metadata,
    };
  }
}
