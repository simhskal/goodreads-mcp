import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryRepository } from "../src/repository.js";
import { fetchShelf } from "../src/rss.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("hosted RSS fetch", () => {
  it("refuses a redirect away from goodreads.com", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(null, {
            status: 302,
            headers: { location: "https://evil.example/rss" },
          }),
      ),
    );
    const repository = {
      async cachedShelf() {
        return null;
      },
      async cacheShelf() {
        return undefined;
      },
    } as unknown as LibraryRepository;

    await expect(
      fetchShelf(repository, "auth-1", "123", "abc123-private", "read"),
    ).rejects.toThrow("Redirect target is not allowed.");
  });
});
