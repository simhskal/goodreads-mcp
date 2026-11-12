import { afterEach, describe, expect, it } from "vitest";

const PRODUCTION_URL = "VERCEL_PROJECT_PRODUCTION_URL";
const original = process.env[PRODUCTION_URL];

afterEach(() => {
  if (original === undefined) delete process.env[PRODUCTION_URL];
  else process.env[PRODUCTION_URL] = original;
});

describe("public /mcp route", () => {
  it("rejects the shared deployment with a pointer to OAuth", async () => {
    process.env[PRODUCTION_URL] = "goodreads-mcp-chi.vercel.app";
    const { POST } = await import("../../../api/server.js");
    const response = await POST(
      new Request("https://goodreads-mcp-chi.vercel.app/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "x-goodreads-user-id": "12345678",
          "x-goodreads-rss-key": "abc123-private",
        },
        body: "{}",
      }),
    );

    expect(response.status).toBe(410);
    const body = await response.json();
    expect(body.endpoint).toBe(
      "https://goodreads-mcp-chi.vercel.app/oauth/mcp",
    );
    expect(JSON.stringify(body)).not.toContain("abc123-private");
  });

  it("keeps header auth on a self-hosted deployment and hides the RSS key", async () => {
    process.env[PRODUCTION_URL] = "books.example.com";
    const { POST } = await import("../../../api/server.js");
    const response = await POST(
      new Request("https://books.example.com/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "x-goodreads-user-id": "12345678",
          "x-goodreads-rss-key": "abc123-private",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "probe", version: "0" },
          },
        }),
      }),
    );

    expect(response.status).not.toBe(410);
    const text = await response.text();
    expect(text).not.toContain("abc123-private");
    expect(text).toContain("goodreads-mcp");
  });
});
