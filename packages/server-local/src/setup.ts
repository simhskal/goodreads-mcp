import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { promisify } from "node:util";

export const DEFAULT_REMOTE_ENDPOINT =
  "https://goodreads-mcp-chi.vercel.app/mcp";

const execFileAsync = promisify(execFile);

export type SetupClient = "claude" | "codex";

export interface GoodreadsCredentials {
  userId: string;
  rssKey?: string;
}

export interface GoodreadsBrowser {
  open(): Promise<void>;
  waitForUser(): Promise<void>;
  findCredentials(): Promise<GoodreadsCredentials>;
  close(): Promise<void>;
}

export interface SetupPrompter {
  ask(question: string): Promise<string>;
}

export function parseGoodreadsUserId(value: string): string | undefined {
  const match = value.match(
    /(?:https?:\/\/)?(?:www\.)?goodreads\.com\/user\/show\/(\d+)/i,
  );
  if (match) return match[1];
  return /^\d+$/.test(value.trim()) ? value.trim() : undefined;
}

export function parseGoodreadsRssKey(value: string): string | undefined {
  try {
    const url = new URL(value);
    const key = url.searchParams.get("key")?.trim();
    return key || undefined;
  } catch {
    return undefined;
  }
}

export function formatSetupSummary(
  client: SetupClient,
  destination: string,
  credentials: GoodreadsCredentials,
): string {
  const rssStatus = credentials.rssKey ? "found" : "not found (public feed)";
  return [
    "Goodreads details found:",
    `- Goodreads user ID: found`,
    `- RSS key: ${rssStatus}`,
    "",
    `The ${client} configuration will be updated at:`,
    `  ${destination}`,
    "",
    "The Goodreads password and browser session will not be saved.",
  ].join("\n");
}

export function quoteTomlString(value: string): string {
  return JSON.stringify(value);
}

export function upsertTomlSection(
  content: string,
  section: string,
  entries: Record<string, string>,
): string {
  const header = `[${section}]`;
  const lines = content ? content.split(/\r?\n/) : [];
  const sectionStart = lines.findIndex((line) => line.trim() === header);
  const renderedEntries = Object.entries(entries).map(
    ([key, value]) => `${key} = ${quoteTomlString(value)}`,
  );

  if (sectionStart === -1) {
    const prefix = content && !content.endsWith("\n") ? "\n" : "";
    return `${content}${prefix}\n${header}\n${renderedEntries.join("\n")}\n`;
  }

  let sectionEnd = lines.length;
  for (let index = sectionStart + 1; index < lines.length; index += 1) {
    if (/^\s*\[[^\]]+\]\s*$/.test(lines[index])) {
      sectionEnd = index;
      break;
    }
  }

  const replacement = [header, ...renderedEntries];
  lines.splice(sectionStart, sectionEnd - sectionStart, ...replacement);
  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

export function buildCodexConfig(
  existing: string,
  endpoint: string,
  credentials: GoodreadsCredentials,
): string {
  let content = upsertTomlSection(existing, "mcp_servers.goodreads", {
    url: endpoint,
  });

  const headers: Record<string, string> = {
    '"X-Goodreads-User-ID"': credentials.userId,
  };
  if (credentials.rssKey) {
    headers['"X-Goodreads-RSS-Key"'] = credentials.rssKey;
  }
  return upsertTomlSection(
    content,
    "mcp_servers.goodreads.env_http_headers",
    headers,
  );
}

export async function readOptionalFile(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isMissingFile(error)) return "";
    throw error;
  }
}

export async function writeCodexConfig(
  endpoint: string,
  credentials: GoodreadsCredentials,
  home = homedir(),
): Promise<string> {
  const directory = `${home}/.codex`;
  const path = `${directory}/config.toml`;
  const existing = await readOptionalFile(path);
  const updated = buildCodexConfig(existing, endpoint, credentials);
  await mkdir(directory, { recursive: true });
  await writeFile(path, updated, {
    mode: constants.S_IRUSR | constants.S_IWUSR,
  });
  await chmod(path, constants.S_IRUSR | constants.S_IWUSR);
  return path;
}

export async function writeClaudeConfig(
  endpoint: string,
  credentials: GoodreadsCredentials,
): Promise<void> {
  const headers = [`X-Goodreads-User-ID: ${credentials.userId}`];
  if (credentials.rssKey) {
    headers.push(`X-Goodreads-RSS-Key: ${credentials.rssKey}`);
  }

  await execFileAsync(
    "claude",
    [
      "mcp",
      "add",
      "--scope",
      "user",
      "--transport",
      "http",
      "--header",
      ...headers,
      "goodreads",
      endpoint,
    ],
    { windowsHide: true },
  );
}

export async function runSetup(options: {
  browser: GoodreadsBrowser;
  client: SetupClient;
  endpoint?: string;
  prompter: SetupPrompter;
  home?: string;
}): Promise<void> {
  const endpoint = options.endpoint ?? DEFAULT_REMOTE_ENDPOINT;
  await options.browser.open();
  try {
    await options.browser.waitForUser();
    const credentials = await options.browser.findCredentials();
    const destination =
      options.client === "codex"
        ? `${options.home ?? homedir()}/.codex/config.toml`
        : "Claude user MCP settings";

    console.log(formatSetupSummary(options.client, destination, credentials));
    const confirmation = await options.prompter.ask(
      "Write this local configuration now? [y/N] ",
    );
    if (!/^y(?:es)?$/i.test(confirmation.trim())) {
      console.log("No changes made.");
      return;
    }

    if (options.client === "codex") {
      await writeCodexConfig(endpoint, credentials, options.home);
    } else {
      await writeClaudeConfig(endpoint, credentials);
    }

    console.log(`Goodreads is connected to ${options.client}.`);
    console.log(
      "Quit and reopen your AI client before trying your first question.",
    );
  } finally {
    await options.browser.close();
  }
}

function isMissingFile(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT",
  );
}
