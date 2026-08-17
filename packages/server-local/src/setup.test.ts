import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCodexConfig,
  formatSetupSummary,
  migrateCodexHeaderSection,
  parseGoodreadsRssKey,
  parseGoodreadsUserId,
  runSetup,
  upsertTomlSection,
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

  it("parses an RSS key without exposing it in a summary", () => {
    const key = parseGoodreadsRssKey(
      "https://www.goodreads.com/review/list_rss/12345678?key=abc123-private&shelf=read",
    );

    expect(key).toBe("abc123-private");
    expect(
      formatSetupSummary("codex", "/tmp/config.toml", {
        userId: "12345678",
        rssKey: key,
      }),
    ).not.toContain(key);
  });

  it("upserts a TOML section without duplicating it", () => {
    const first = upsertTomlSection(
      'model = "gpt-5"\n',
      "mcp_servers.goodreads",
      {
        url: "https://goodreads-mcp-chi.vercel.app/mcp",
      },
    );
    const second = upsertTomlSection(first, "mcp_servers.goodreads", {
      url: "https://goodreads-mcp-chi.vercel.app/mcp",
    });

    expect(second.match(/\[mcp_servers\.goodreads\]/g)).toHaveLength(1);
    expect(second).toContain(
      'url = "https://goodreads-mcp-chi.vercel.app/mcp"',
    );
  });

  it("builds Codex HTTP headers while preserving other configuration", () => {
    const config = buildCodexConfig(
      'model = "gpt-5"\n',
      "https://goodreads-mcp-chi.vercel.app/mcp",
      { userId: "12345678", rssKey: "abc123-private" },
    );

    expect(config).toContain('model = "gpt-5"');
    expect(config).toContain(
      '[mcp_servers.goodreads.http_headers]\n"X-Goodreads-User-ID" = "12345678"',
    );
    expect(config).toContain('"X-Goodreads-RSS-Key" = "abc123-private"');
    expect(config).not.toContain("env_http_headers");
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
      expect(config).toContain('"X-Goodreads-User-ID" = "12345678"');
      expect(calls).toEqual(["open", "wait", "find", "close"]);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
