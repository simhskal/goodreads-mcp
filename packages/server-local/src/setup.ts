import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { promisify } from "node:util";
import {
  DEFAULT_REMOTE_ENDPOINT,
  endpointAcceptsClientRssKey,
} from "./hosted.js";

export { DEFAULT_REMOTE_ENDPOINT };

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
  endpoint?: string,
): string {
  const rssStatus = credentials.rssKey ? "found" : "not found (public feed)";
  const lines = [
    "Goodreads details found:",
    `- Goodreads user ID: found`,
    `- RSS key: ${rssStatus}`,
    "",
    `The ${client} configuration will be updated at:`,
    `  ${destination}`,
    "",
    "The Goodreads password and browser session will not be saved.",
  ];
  if (endpoint && !endpointAcceptsClientRssKey(endpoint)) {
    lines.push(
      "",
      "The RSS key is not written into this client config. The hosted server asks for it during OAuth connect and encrypts it before storage.",
    );
  }
  return lines.join("\n");
}

export function clientHeaderEntries(
  endpoint: string,
  credentials: GoodreadsCredentials,
): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Goodreads-User-ID": credentials.userId,
  };
  if (credentials.rssKey && endpointAcceptsClientRssKey(endpoint)) {
    headers["X-Goodreads-RSS-Key"] = credentials.rssKey;
  }
  return headers;
}

export function claudeMcpAddArgs(
  endpoint: string,
  credentials: GoodreadsCredentials,
): string[] {
  const headers = Object.entries(
    clientHeaderEntries(endpoint, credentials),
  ).map(([name, value]) => `${name}: ${value}`);
  return [
    "mcp",
    "add",
    "--scope",
    "user",
    "--transport",
    "http",
    ...headers.flatMap((header) => ["--header", header]),
    "goodreads",
    endpoint,
  ];
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

export function migrateCodexHeaderSection(content: string): string {
  return content.replace(
    /^\[mcp_servers\.goodreads\.env_http_headers\]\s*$/m,
    "[mcp_servers.goodreads.http_headers]",
  );
}

export function buildCodexConfig(
  existing: string,
  endpoint: string,
  credentials: GoodreadsCredentials,
): string {
  let content = upsertTomlSection(existing, "mcp_servers.goodreads", {
    url: endpoint,
  });
  content = migrateCodexHeaderSection(content);

  const headers = Object.fromEntries(
    Object.entries(clientHeaderEntries(endpoint, credentials)).map(
      ([name, value]) => [`"${name}"`, value],
    ),
  );
  return upsertTomlSection(
    content,
    "mcp_servers.goodreads.http_headers",
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
  await execFileAsync("claude", claudeMcpAddArgs(endpoint, credentials), {
    windowsHide: true,
  });
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

    console.log(
      formatSetupSummary(options.client, destination, credentials, endpoint),
    );
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

    if (endpointAcceptsClientRssKey(endpoint)) {
      console.log(`Goodreads is connected to ${options.client}.`);
    } else {
      console.log(
        `The hosted Goodreads endpoint is saved for ${options.client}.`,
      );
      console.log(
        "Sign in when the client connects, and enter the RSS key on the connect page. It is not stored in this client config.",
      );
    }
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
