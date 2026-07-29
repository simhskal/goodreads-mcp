import { createMcpHandler } from "mcp-handler";
import { GoodreadsRssLibraryService } from "../packages/core/src/index.js";
import { readConfig } from "../packages/server-local/src/config.js";
import { registerTools } from "../packages/server-local/src/server.js";

const handler = createMcpHandler(
  (server) => {
    let library: GoodreadsRssLibraryService | undefined;
    const service = () =>
      (library ??= new GoodreadsRssLibraryService(readConfig()));

    registerTools(server, {
      listShelves: () => service().listShelves(),
      getReadingList: (shelf, limit) => service().getReadingList(shelf, limit),
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

export { handler as DELETE, handler as GET, handler as POST };
