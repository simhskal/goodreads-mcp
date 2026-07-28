#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readConfig } from "./config.js";
import { GoodreadsLibraryService } from "./library-service.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const config = readConfig();
  const server = createServer(new GoodreadsLibraryService(config));
  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`goodreads-mcp: ${message}`);
  process.exitCode = 1;
});
