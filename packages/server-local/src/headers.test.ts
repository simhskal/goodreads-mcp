import { describe, expect, it } from "vitest";
import { redactRssKeyHeader } from "./headers.js";

describe("RSS key header redaction", () => {
  it("removes the header from the request handed to later logging", () => {
    const original = new Request("https://books.example.com/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goodreads-user-id": "12345678",
        "X-Goodreads-RSS-Key": "abc123-private",
      },
      body: "{}",
    });

    const redacted = redactRssKeyHeader(original);

    expect(redacted.rssKey).toBe("abc123-private");
    expect(redacted.request.headers.get("x-goodreads-rss-key")).toBeNull();
    expect(redacted.request.headers.get("x-goodreads-user-id")).toBe(
      "12345678",
    );
    expect(original.headers.get("x-goodreads-rss-key")).toBe("abc123-private");
    expect(JSON.stringify([...redacted.request.headers])).not.toContain(
      "abc123-private",
    );
  });

  it("leaves a request without the header untouched", () => {
    const original = new Request("https://books.example.com/mcp");
    expect(redactRssKeyHeader(original).request).toBe(original);
    expect(redactRssKeyHeader(original).rssKey).toBeUndefined();
  });
});
