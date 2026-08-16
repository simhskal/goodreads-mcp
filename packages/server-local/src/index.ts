#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createGoodreadsBrowser } from "./browser-setup.js";
import { readConfig } from "./config.js";
import { GoodreadsLibraryService } from "./library-service.js";
import { createServer } from "./server.js";
import { runSetup, type SetupClient } from "./setup.js";

async function runSetupCommand(args: string[]): Promise<void> {
  const client = parseClient(args);
  if (!client) {
    throw new Error(
      "Use `goodreads-mcp setup --client claude` or `--client codex`.",
    );
  }

  const readline = await import("node:readline/promises");
  const terminal = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const prompter = { ask: (question: string) => terminal.question(question) };

  try {
    await runSetup({
      browser: await createGoodreadsBrowser(prompter),
      client,
      prompter,
    });
  } finally {
    terminal.close();
  }
}

function parseClient(args: string[]): SetupClient | undefined {
  const value = args
    .find((arg) => arg.startsWith("--client="))
    ?.split("=", 2)[1];
  const index = args.indexOf("--client");
  const client = value ?? (index >= 0 ? args[index + 1] : undefined);
  return client === "claude" || client === "codex" ? client : undefined;
}

async function main(): Promise<void> {
  if (process.argv[2] === "setup") {
    await runSetupCommand(process.argv.slice(3));
    return;
  }

  const config = readConfig();
  const server = createServer(new GoodreadsLibraryService(config));
  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`goodreads-mcp: ${message}`);
  process.exitCode = 1;
});
