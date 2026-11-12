import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_REMOTE_ENDPOINT } from "./hosted.js";
import {
  buildClaudeConfig,
  buildCodexConfig,
  claudeMcpAddArgs,
  formatSetupSummary,
  migrateCodexHeaderSection,
  parseGoodreadsRssKey,
  parseGoodreadsUserId,
  runSetup,
  upsertTomlSection,
  writeClaudeConfig,
} from "./setup.js";

describe("Goodreads setup helpers", () => {
  it("parses a numeric user ID from a profile URL", () => {
    expect(
      parseGoodreadsUserId(
        "https://www.goodreads.com/user/show/12345678-reader",
      ),
    ).toBe("12345678");
  });

  it("accepts a numeric user ID directly", () => {
    expect(parseGoodreadsUserId(" 12345678 ")).toBe("12345678");
  });

  it("rejects unrelated URLs", () => {
    expect(parseGoodreadsUserId("https://example.com/user/show/12345678")).toBe(
      undefined,
    );
  });

  it("rejects an oversized numeric user ID", () => {
    expect(parseGoodreadsUserId("1".repeat(21))).toBeUndefined();
  });

  it("parses an RSS key without exposing it in a summary", () => {
    const key = parseGoodreadsRssKey(
      "https://www.goodreads.com/review/list_rss/12345678?key=abc123-private&shelf=read",
    );

    expect(key).toBe("abc123-private");
    expect(
      parseGoodreadsRssKey(
        "/review/list_rss/12345678?key=abc123-private&shelf=read",
      ),
    ).toBe("abc123-private");
    expect(
      parseGoodreadsRssKey(
        "https://evil.example/review/list_rss/1?key=abc123-private",
      ),
    ).toBeUndefined();
    expect(
      parseGoodreadsRssKey(
        "https://www.goodreads.com/review/list_rss/1?key=bad key",
      ),
    ).toBeUndefined();
    expect(
      parseGoodreadsRssKey("https://www.goodreads.com/?key=abc123-private"),
    ).toBeUndefined();
    const summary = formatSetupSummary(
      "codex",
      "/tmp/config.toml",
      {
        userId: "12345678",
        rssKey: key,
      },
      DEFAULT_REMOTE_ENDPOINT,
    );
    expect(summary).not.toContain(key);
    expect(summary).toContain("not written into this client config");
  });

  it("upserts a TOML section without duplicating it", () => {
    const first = upsertTomlSection(
      'model = "gpt-5"\n',
      "mcp_servers.goodreads",
      {
        url: DEFAULT_REMOTE_ENDPOINT,
      },
    );
    const second = upsertTomlSection(first, "mcp_servers.goodreads", {
      url: DEFAULT_REMOTE_ENDPOINT,
    });

    expect(second.match(/\[mcp_servers\.goodreads\]/g)).toHaveLength(1);
    expect(second).toContain(`url = "${DEFAULT_REMOTE_ENDPOINT}"`);
  });

  it("builds Codex HTTP headers while preserving other configuration", () => {
    const config = buildCodexConfig(
      'model = "gpt-5"\n',
      "https://books.example.com/mcp",
      { userId: "12345678", rssKey: "abc123-private" },
    );

    expect(config).toContain('model = "gpt-5"');
    expect(config).toContain(
      '[mcp_servers.goodreads.http_headers]\n"X-Goodreads-User-ID" = "12345678"',
    );
    expect(config).toContain('"X-Goodreads-RSS-Key" = "abc123-private"');
    expect(config).not.toContain("env_http_headers");
  });

  it("omits the RSS key from client config aimed at the public host", () => {
    const credentials = { userId: "12345678", rssKey: "abc123-private" };
    const config = buildCodexConfig(
      `[mcp_servers.goodreads.http_headers]\n"X-Goodreads-User-ID" = "12345678"\n"X-Goodreads-RSS-Key" = "abc123-private"\n`,
      "https://goodreads-mcp-chi.vercel.app/mcp",
      credentials,
    );

    expect(config).toContain(
      'url = "https://goodreads-mcp-chi.vercel.app/mcp"',
    );
    expect(config).toContain('"X-Goodreads-User-ID" = "12345678"');
    expect(config).not.toContain("abc123-private");
    expect(config).not.toContain("X-Goodreads-RSS-Key");
    expect(
      buildClaudeConfig("{}", DEFAULT_REMOTE_ENDPOINT, credentials),
    ).not.toContain("abc123-private");
    expect(
      claudeMcpAddArgs(DEFAULT_REMOTE_ENDPOINT, credentials),
    ).not.toContain("abc123-private");
  });

  it("repeats --header for each Claude header on a self-hosted endpoint", () => {
    expect(
      claudeMcpAddArgs("https://books.example.com/mcp", {
        userId: "12345678",
        rssKey: "abc123-private",
      }),
    ).toEqual([
      "mcp",
      "add",
      "--scope",
      "user",
      "--transport",
      "http",
      "--header",
      "X-Goodreads-User-ID: 12345678",
      "--header",
      "X-Goodreads-RSS-Key: abc123-private",
      "goodreads",
      "https://books.example.com/mcp",
    ]);
  });

  it("migrates the previously generated Codex header section", () => {
    const config = migrateCodexHeaderSection(
      '[mcp_servers.goodreads.env_http_headers]\n"X-Goodreads-User-ID" = "12345678"\n',
    );

    expect(config).toBe(
      '[mcp_servers.goodreads.http_headers]\n"X-Goodreads-User-ID" = "12345678"\n',
    );
  });

  it("asks before writing local Codex configuration and closes the browser", async () => {
    const home = await mkdtemp(join(tmpdir(), "goodreads-mcp-"));
    const calls: string[] = [];

    try {
      await runSetup({
        browser: {
          async open() {
            calls.push("open");
          },
          async waitForUser() {
            calls.push("wait");
          },
          async findCredentials() {
            calls.push("find");
            return { userId: "12345678", rssKey: "abc123-private" };
          },
          async close() {
            calls.push("close");
          },
        },
        client: "codex",
        home,
        prompter: {
          async ask(question) {
            return question.startsWith("Write") ? "y" : "";
          },
        },
      });

      const config = await readFile(join(home, ".codex/config.toml"), "utf8");
      expect(config).toContain(`url = "${DEFAULT_REMOTE_ENDPOINT}"`);
      expect(config).toContain('"X-Goodreads-User-ID" = "12345678"');
      expect(config).not.toContain("abc123-private");
      expect(calls).toEqual(["open", "wait", "find", "close"]);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("writes the Claude user config without putting the RSS key on a command line", async () => {
    const home = await mkdtemp(join(tmpdir(), "goodreads-mcp-claude-"));
    const rssKey = "abc123-private";
    try {
      const existing = JSON.stringify({
        numStartups: 4,
        mcpServers: { other: { command: "echo" } },
      });
      const updated = buildClaudeConfig(
        existing,
        "https://books.example.com/mcp",
        { userId: "12345678", rssKey },
      );
      const parsed = JSON.parse(updated) as {
        numStartups: number;
        mcpServers: Record<string, { headers?: Record<string, string> }>;
      };
      expect(parsed.numStartups).toBe(4);
      expect(parsed.mcpServers.other).toEqual({ command: "echo" });
      expect(
        parsed.mcpServers.goodreads?.headers?.["X-Goodreads-RSS-Key"],
      ).toBe(rssKey);
      expect(updated).not.toContain("mcp add");

      const path = await writeClaudeConfig(
        "https://books.example.com/mcp",
        { userId: "12345678", rssKey },
        home,
      );
      const mode = (await stat(path)).mode & 0o777;
      expect(mode).toBe(0o600);
      expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({
        mcpServers: {
          goodreads: {
            type: "http",
            headers: { "X-Goodreads-RSS-Key": rssKey },
          },
        },
      });
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("leaves an invalid Claude config file untouched", async () => {
    const home = await mkdtemp(join(tmpdir(), "goodreads-mcp-claude-"));
    const path = join(home, ".claude.json");
    try {
      await writeFile(path, "{", "utf8");
      await expect(
        writeClaudeConfig(
          "https://goodreads-mcp-chi.vercel.app/mcp",
          { userId: "12345678", rssKey: "abc123-private" },
          home,
        ),
      ).rejects.toThrow("valid JSON");
      expect(await readFile(path, "utf8")).toBe("{");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
