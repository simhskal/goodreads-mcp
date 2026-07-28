import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchOpenLibraryBook } from "@goodreads-mcp/core";
import { LibraryRepository } from "./repository.js";
import { fetchShelf } from "./rss.js";
import type { AuthProps, Env } from "./types.js";

const text = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

export class GoodreadsMcp extends McpAgent<
  Env,
  Record<string, never>,
  AuthProps
> {
  server = new McpServer({ name: "goodreads-mcp", version: "0.1.0" });

  async init() {
    const repository = new LibraryRepository(this.env.DB);
    const userId = this.props?.userId;
    if (!userId)
      throw new Error("Authenticated Goodreads identity is missing.");

    this.server.tool(
      "list_shelves",
      "List shelves found in the connected library.",
      {},
      async () => {
        const csvShelves = await repository.shelves(userId);
        return text([
          ...new Set(["currently-reading", "read", "to-read", ...csvShelves]),
        ]);
      },
    );

    this.server.tool(
      "get_reading_list",
      "Get books from one of the connected user's Goodreads shelves.",
      {
        shelf: z.string().min(1),
        limit: z.number().int().min(1).max(100).default(25),
      },
      async ({ shelf, limit }) => {
        const stored = await repository.list(userId, shelf, limit);
        if (stored.length >= limit) return text(stored);
        const user = await repository.user(userId);
        if (!user)
          throw new Error("The connected Goodreads account no longer exists.");
        try {
          const live = await fetchShelf(
            this.env.CACHE,
            user.goodreadsUserId,
            user.rssKey,
            shelf,
          );
          await repository.importBooks(userId, live);
          return text(
            (await repository.list(userId, shelf, limit)).slice(0, limit),
          );
        } catch (error) {
          if (stored.length)
            return text({ books: stored, warning: message(error) });
          throw error;
        }
      },
    );

    this.server.tool(
      "get_currently_reading",
      "Get books currently being read.",
      {
        limit: z.number().int().min(1).max(100).default(25),
      },
      async ({ limit }) =>
        text(
          await this.readShelf(repository, userId, "currently-reading", limit),
        ),
    );

    this.server.tool(
      "get_recently_read",
      "Get recently finished books.",
      {
        limit: z.number().int().min(1).max(100).default(25),
      },
      async ({ limit }) =>
        text(await this.readShelf(repository, userId, "read", limit)),
    );

    this.server.tool(
      "reading_stats",
      "Summarize reading count, rating, and pace from the imported library.",
      {
        year: z.number().int().min(1000).max(9999).optional(),
      },
      async ({ year }) => {
        const stats = await repository.stats(userId, year);
        const elapsedMonths = year
          ? 12
          : monthsBetween(
              String(stats?.firstFinished ?? ""),
              String(stats?.lastFinished ?? ""),
            );
        return text({
          ...stats,
          year: year ?? null,
          booksPerMonth: elapsedMonths
            ? Number((Number(stats?.booksRead ?? 0) / elapsedMonths).toFixed(2))
            : 0,
        });
      },
    );

    this.server.tool(
      "search_library",
      "Search titles and authors in the connected user's library.",
      {
        query: z.string().min(1).max(200),
        limit: z.number().int().min(1).max(100).default(25),
      },
      async ({ query, limit }) =>
        text(await repository.search(userId, query, limit)),
    );

    this.server.tool(
      "get_book",
      "Get a library book and enrich ISBN metadata through Open Library.",
      {
        isbn: z.string().min(1).optional(),
        title: z.string().min(1).optional(),
      },
      async ({ isbn, title }) => {
        const query = isbn ?? title;
        if (!query) throw new Error("Provide isbn or title.");
        const book = await repository.book(userId, query);
        if (!book) return text({ found: false });
        const identifier = String(book.isbn13 ?? book.isbn ?? "");
        return text({
          ...book,
          openLibrary: identifier
            ? await fetchOpenLibraryBook(identifier)
            : null,
        });
      },
    );

    this.server.tool(
      "delete_account",
      "Permanently delete the connected profile and imported library.",
      {
        confirm: z.literal("DELETE"),
      },
      async () => {
        await repository.deleteUser(userId);
        return text({
          deleted: true,
          message:
            "Account data was permanently deleted. Revoke the MCP connection in your client.",
        });
      },
    );
  }

  private async readShelf(
    repository: LibraryRepository,
    userId: string,
    shelf: string,
    limit: number,
  ) {
    const user = await repository.user(userId);
    if (!user)
      throw new Error("The connected Goodreads account no longer exists.");
    try {
      await repository.importBooks(
        userId,
        await fetchShelf(
          this.env.CACHE,
          user.goodreadsUserId,
          user.rssKey,
          shelf,
        ),
      );
    } catch (error) {
      const stored = await repository.list(userId, shelf, limit);
      if (stored.length) return { books: stored, warning: message(error) };
      throw error;
    }
    return repository.list(userId, shelf, limit);
  }
}

const message = (error: unknown) =>
  error instanceof Error ? error.message : "Live RSS refresh failed.";

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
