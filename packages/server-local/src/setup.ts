import { constants } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import {
  DEFAULT_REMOTE_ENDPOINT,
  endpointAcceptsClientRssKey,
} from "./hosted.js";

export { DEFAULT_REMOTE_ENDPOINT };

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
    /(?:https?:\/\/)?(?:www\.)?goodreads\.com\/user\/show\/(\d{1,20})(?!\d)/i,
  );
  if (match) return match[1];
  const trimmed = value.trim();
  return /^\d{1,20}$/.test(trimmed) ? trimmed : undefined;
}

const RSS_KEY = /^[A-Za-z0-9_-]{6,256}$/;
const GOODREADS_HOST = /^(?:www\.)?goodreads\.com$/i;

export function parseGoodreadsRssKey(value: string): string | undefined {
  try {
    const url = new URL(value, "https://www.goodreads.com");
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    if (!GOODREADS_HOST.test(url.hostname)) return undefined;
    if (!url.pathname.includes("/review/list_rss/")) return undefined;
    const key = url.searchParams.get("key")?.trim();
    if (!key || !RSS_KEY.test(key)) return undefined;
    return key;
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

export function buildClaudeConfig(
  existing: string,
  endpoint: string,
  credentials: GoodreadsCredentials,
): string {
  let parsed: unknown;
  try {
    parsed = existing.trim() ? JSON.parse(existing) : {};
  } catch {
    throw new Error("Claude configuration is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Claude configuration is not a JSON object.");
  }
  const config = parsed as Record<string, unknown>;
  const current = config.mcpServers;
  const mcpServers: Record<string, unknown> =
    current && typeof current === "object" && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {};
  mcpServers.goodreads = {
    type: "http",
    url: endpoint,
    headers: clientHeaderEntries(endpoint, credentials),
  };
  config.mcpServers = mcpServers;
  return `${JSON.stringify(config, null, 2)}\n`;
}

// Claude's `mcp add` commands put header values on argv. Write the user
// config file instead so the RSS key stays out of the process command line.
export async function writeClaudeConfig(
  endpoint: string,
  credentials: GoodreadsCredentials,
  home = homedir(),
): Promise<string> {
  const path = `${home}/.claude.json`;
  const existing = await readOptionalFile(path);
  const updated = buildClaudeConfig(existing, endpoint, credentials);
  await writeFile(path, updated, {
    mode: constants.S_IRUSR | constants.S_IWUSR,
  });
  await chmod(path, constants.S_IRUSR | constants.S_IWUSR);
  return path;
}

export async function runSetup(options: {
  browser: GoodreadsBrowser;
  client: SetupClient;
  endpoint?: string;
  prompter: SetupPrompter;
  home?: string;
}): Promise<void> {
  const endpoint = options.endpoint ?? DEFAULT_REMOTE_ENDPOINT;
  const home = options.home ?? homedir();
  await options.browser.open();
  try {
    await options.browser.waitForUser();
    const credentials = await options.browser.findCredentials();
    const destination =
      options.client === "codex"
        ? `${home}/.codex/config.toml`
        : `${home}/.claude.json`;

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
      await writeCodexConfig(endpoint, credentials, home);
    } else {
      await writeClaudeConfig(endpoint, credentials, home);
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
