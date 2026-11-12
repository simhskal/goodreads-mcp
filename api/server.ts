import { createMcpHandler } from "mcp-handler";
import { GoodreadsRssLibraryService } from "../packages/core/src/index.js";
import { redactRssKeyHeader } from "../packages/server-local/src/headers.js";
import { sharedDeploymentMcpResponse } from "../packages/server-local/src/hosted.js";
import { registerTools } from "../packages/server-local/src/server.js";

const route = (request: Request) => {
  const deprecated = sharedDeploymentMcpResponse();
  if (deprecated) return deprecated;

  const { request: sanitized, rssKey } = redactRssKeyHeader(request);
  const handler = createMcpHandler(
    (server) => {
      let library: GoodreadsRssLibraryService | undefined;
      const service = () =>
        (library ??= new GoodreadsRssLibraryService(
          readConfig(sanitized, rssKey),
        ));

      registerTools(server as unknown as Parameters<typeof registerTools>[0], {
        listShelves: () => service().listShelves(),
        getReadingList: (shelf, limit) =>
          service().getReadingList(shelf, limit),
        getCurrentlyReading: (limit) => service().getCurrentlyReading(limit),
        getRecentlyRead: (limit) => service().getRecentlyRead(limit),
        readingBrief: (year) => service().readingBrief(year),
        readingStats: (year) => service().readingStats(year),
        searchLibrary: (query, limit) => service().searchLibrary(query, limit),
        getBook: (lookup) => service().getBook(lookup),
      });
    },
    {
      serverInfo: { name: "goodreads-mcp", version: "0.1.0" },
      verboseLogs: process.env.NODE_ENV !== "production",
    },
  );

  return handler(sanitized);
};

function readConfig(request: Request, rssKey: string | undefined) {
  const userId = request.headers.get("x-goodreads-user-id")?.trim();

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
