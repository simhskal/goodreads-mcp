import { describe, expect, it } from "vitest";
import { statelessLibraryConfig } from "../../../api/server.js";

describe("stateless Goodreads headers", () => {
  it("accepts a short numeric user id", () => {
    expect(
      statelessLibraryConfig(
        new Headers({
          "x-goodreads-user-id": "12345",
          "x-goodreads-rss-key": "secret",
        }),
      ),
    ).toEqual({ userId: "12345", rssKey: "secret" });
  });

  it("rejects an unbounded digit user id and an oversized RSS key", () => {
    expect(() =>
      statelessLibraryConfig(
        new Headers({ "x-goodreads-user-id": "1".repeat(21) }),
      ),
    ).toThrow("at most 20 digits");
    expect(() =>
      statelessLibraryConfig(
        new Headers({
          "x-goodreads-user-id": "123",
          "x-goodreads-rss-key": "k".repeat(257),
        }),
      ),
    ).toThrow("too long");
  });
});
