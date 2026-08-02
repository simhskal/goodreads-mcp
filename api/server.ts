import { createMcpHandler } from "mcp-handler";
import { GoodreadsRssLibraryService } from "../packages/core/src/index.js";
import { registerTools } from "../packages/server-local/src/server.js";

const route = (request: Request) => {
  const handler = createMcpHandler(
    (server) => {
      let library: GoodreadsRssLibraryService | undefined;
      const service = () =>
        (library ??= new GoodreadsRssLibraryService(readConfig(request)));

      registerTools(server, {
        listShelves: () => service().listShelves(),
        getReadingList: (shelf, limit) =>
          service().getReadingList(shelf, limit),
        getCurrentlyReading: (limit) => service().getCurrentlyReading(limit),
        getRecentlyRead: (limit) => service().getRecentlyRead(limit),
        readingStats: (year) => service().readingStats(year),
        searchLibrary: (query, limit) => service().searchLibrary(query, limit),
        getBook: (lookup) => service().getBook(lookup),
      });
    },
    {},
    {
      basePath: "",
      maxDuration: 60,
      verboseLogs: process.env.NODE_ENV !== "production",
    },
  );

  return handler(request);
};

function readConfig(request: Request) {
  const userId = request.headers.get("x-goodreads-user-id")?.trim();
  const rssKey = request.headers.get("x-goodreads-rss-key")?.trim();

  if (!userId) {
    throw new Error(
      "X-Goodreads-User-ID is required. Configure it in your MCP client's HTTP headers.",
    );
  }

  if (!/^\d+$/.test(userId)) {
    throw new Error("X-Goodreads-User-ID must contain only digits.");
  }

  return { userId, ...(rssKey ? { rssKey } : {}) };
}

export { route as DELETE, route as GET, route as POST };
