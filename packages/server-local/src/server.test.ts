import { describe, expect, it } from "vitest";
import { searchQueryInput, shelfInput } from "./server.js";

describe("tool input limits", () => {
  it("accepts Goodreads shelf slugs and rejects everything else", () => {
    expect(shelfInput.parse(" currently-reading ")).toBe("currently-reading");
    expect(() => shelfInput.parse("my shelf")).toThrow();
    expect(() => shelfInput.parse("a".repeat(65))).toThrow();
    expect(() => shelfInput.parse("")).toThrow();
  });

  it("caps search text", () => {
    expect(searchQueryInput.parse("  dune ")).toBe("dune");
    expect(() => searchQueryInput.parse("a".repeat(201))).toThrow();
  });
});
