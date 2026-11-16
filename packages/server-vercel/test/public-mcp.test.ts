import { afterEach, describe, expect, it } from "vitest";

const PRODUCTION_URL = "VERCEL_PROJECT_PRODUCTION_URL";
const original = process.env[PRODUCTION_URL];

afterEach(() => {
  if (original === undefined) delete process.env[PRODUCTION_URL];
  else process.env[PRODUCTION_URL] = original;
});

describe("public /mcp route", () => {
  it("permanently redirects the shared deployment to OAuth and keeps the query", async () => {
    process.env[PRODUCTION_URL] = "goodreads-mcp-chi.vercel.app";
    const { GET, POST } = await import("../../../api/server.js");
    const headers = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "x-goodreads-user-id": "12345678",
      "x-goodreads-rss-key": "abc123-private",
    };
    const target =
      "https://goodreads-mcp-chi.vercel.app/oauth/mcp?shelf=to-read&limit=2";

    for (const method of ["GET", "POST"] as const) {
      const response = await (method === "GET" ? GET : POST)(
        new Request(
          "https://goodreads-mcp-chi.vercel.app/mcp?shelf=to-read&limit=2",
          {
            method,
            headers,
            body: method === "POST" ? "{}" : undefined,
          },
        ),
      );

      expect(response.status).toBe(308);
      expect(response.headers.get("location")).toBe(target);
      expect(await response.text()).not.toContain("abc123-private");
    }
  });

  it("keeps header auth on a self-hosted deployment and hides the RSS key", async () => {
    process.env[PRODUCTION_URL] = "books.example.com";
    const { POST } = await import("../../../api/server.js");
    const response = await POST(
      new Request("https://books.example.com/mcp?shelf=read", {
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

    expect(response.status).not.toBe(308);
    expect(response.status).not.toBe(410);
    expect(response.headers.get("location")).toBeNull();
    const text = await response.text();
    expect(text).not.toContain("abc123-private");
    expect(text).toContain("goodreads-mcp");
  });
});
