import { fetchOpenLibraryBook } from "@organized-chaos/goodreads-mcp-core";
import { decryptCredential } from "./crypto.js";
import { LibraryRepository } from "./repository.js";
import { fetchShelf } from "./rss.js";

export class StoredLibraryService {
  constructor(
    private readonly repository: LibraryRepository,
    private readonly authUserId: string,
  ) {}

  async listShelves() {
    return [
      ...new Set([
        "currently-reading",
        "read",
        "to-read",
        ...(await this.repository.shelves(this.authUserId)),
      ]),
    ];
  }

  async getReadingList(shelf: string, limit: number) {
    const stored = await this.repository.list(this.authUserId, shelf, limit);
    if (stored.length >= limit) return stored;
    try {
      await this.refreshShelf(shelf);
      return (await this.repository.list(this.authUserId, shelf, limit)).slice(
        0,
        limit,
      );
    } catch (error) {
      if (stored.length) return { books: stored, warning: message(error) };
      throw error;
    }
  }

  getCurrentlyReading(limit: number) {
    return this.getReadingList("currently-reading", limit);
  }

  getRecentlyRead(limit: number) {
    return this.getReadingList("read", limit);
  }

  readingBrief(year?: number) {
    return this.repository.readingBrief(this.authUserId, year);
  }

  async readingStats(year?: number) {
    const stats = await this.repository.stats(this.authUserId, year);
    const elapsedMonths = year
      ? 12
      : monthsBetween(
          String(stats?.firstFinished ?? ""),
          String(stats?.lastFinished ?? ""),
        );
    return {
      ...stats,
      year: year ?? null,
      booksPerMonth: elapsedMonths
        ? Number((Number(stats?.booksRead ?? 0) / elapsedMonths).toFixed(2))
        : 0,
    };
  }

  searchLibrary(query: string, limit: number) {
    return this.repository.search(this.authUserId, query, limit);
  }

  async getBook(lookup: { isbn?: string; title?: string }) {
    const query = lookup.isbn ?? lookup.title;
    if (!query) throw new Error("Provide isbn or title.");
    const book = await this.repository.book(this.authUserId, query);
    if (!book) return { found: false };
    const identifier = String(book.isbn13 ?? book.isbn ?? "");
    return {
      ...book,
      openLibrary: identifier ? await fetchOpenLibraryBook(identifier) : null,
    };
  }

  async deleteAccount() {
    await this.repository.deleteUser(this.authUserId);
    return {
      deleted: true,
      message:
        "Stored Goodreads credentials and library data were permanently deleted. Revoke this MCP connection in your client.",
    };
  }

  private async refreshShelf(shelf: string): Promise<void> {
    const profile = await this.repository.profile(this.authUserId);
    if (!profile)
      throw new Error("Connect a Goodreads account before using this tool.");
    await this.repository.importBooks(
      this.authUserId,
      await fetchShelf(
        this.repository,
        this.authUserId,
        profile.goodreadsUserId,
        decryptCredential(profile.encryptedRssKey),
        shelf,
      ),
    );
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Live RSS refresh failed.";
}

function monthsBetween(first: string, last: string): number {
  const start = new Date(first);
  const end = new Date(last);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) return 0;
  return Math.max(
    1,
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      end.getUTCMonth() -
      start.getUTCMonth() +
      1,
  );
}
