import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { errorResult, jsonResult } from "./result.js";

export interface LibraryTools {
  listShelves(): Promise<unknown>;
  getReadingList(shelf: string, limit: number): Promise<unknown>;
  getCurrentlyReading(limit: number): Promise<unknown>;
  getRecentlyRead(limit: number): Promise<unknown>;
  readingStats(year?: number): Promise<unknown>;
  searchLibrary(query: string, limit: number): Promise<unknown>;
  getBook(lookup: { isbn?: string; title?: string }): Promise<unknown>;
}

const limit = z
  .number()
  .int()
  .min(1)
  .max(100)
  .default(20)
  .describe("Maximum number of books to return (1–100)");

function tool(handler: () => Promise<unknown>) {
  return async () => {
    try {
      return jsonResult(await handler());
    } catch (error) {
      return errorResult(error);
    }
  };
}

export function createServer(library: LibraryTools): McpServer {
  const server = new McpServer({
    name: "goodreads-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "list_shelves",
    {
      title: "List Goodreads shelves",
      description: "List the shelves visible in the user's Goodreads RSS feed.",
      inputSchema: {},
    },
    tool(() => library.listShelves()),
  );

  server.registerTool(
    "get_reading_list",
    {
      title: "Get a Goodreads shelf",
      description:
        "Get books from a Goodreads shelf, including author, ISBN, ratings, and reading dates.",
      inputSchema: {
        shelf: z
          .string()
          .trim()
          .min(1)
          .describe("Shelf slug, such as read, currently-reading, or to-read"),
        limit,
      },
    },
    async ({ shelf, limit: max }) => {
      try {
        return jsonResult(await library.getReadingList(shelf, max));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "get_currently_reading",
    {
      title: "Get currently reading",
      description: "Get books on the user's currently-reading shelf.",
      inputSchema: { limit },
    },
    async ({ limit: max }) => {
      try {
        return jsonResult(await library.getCurrentlyReading(max));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "get_recently_read",
    {
      title: "Get recently read books",
      description: "Get the user's most recently finished books.",
      inputSchema: {
        limit: limit.default(10),
      },
    },
    async ({ limit: max }) => {
      try {
        return jsonResult(await library.getRecentlyRead(max));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "reading_stats",
    {
      title: "Get reading statistics",
      description:
        "Calculate books read, pages, ratings, monthly pace, and top authors from the RSS-visible library.",
      inputSchema: {
        year: z
          .number()
          .int()
          .min(1000)
          .max(9999)
          .optional()
          .describe("Optional four-digit calendar year"),
      },
    },
    async ({ year }) => {
      try {
        return jsonResult(await library.readingStats(year));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "search_library",
    {
      title: "Search Goodreads library",
      description:
        "Search the user's RSS-visible Goodreads books by title, author, ISBN, or shelf.",
      inputSchema: {
        query: z.string().trim().min(1).describe("Text to search for"),
        limit,
      },
    },
    async ({ query, limit: max }) => {
      try {
        return jsonResult(await library.searchLibrary(query, max));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "get_book",
    {
      title: "Get book details",
      description:
        "Find a book in the user's library by ISBN or exact title and enrich ISBN lookups with Open Library metadata.",
      inputSchema: {
        isbn: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe("ISBN-10 or ISBN-13"),
        title: z.string().trim().min(1).optional().describe("Exact book title"),
      },
    },
    async ({ isbn, title }) => {
      if (!isbn && !title) {
        return errorResult(new Error("Provide either isbn or title."));
      }
      try {
        return jsonResult(await library.getBook({ isbn, title }));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  return server;
}
