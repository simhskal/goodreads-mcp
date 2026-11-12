import { describe, expect, it, vi } from "vitest";
import { fetchTextBounded } from "../src/http.js";

const goodreads = "https://www.goodreads.com/review/list_rss/123";

function fetchMock(
  impl: (url: URL, init?: RequestInit) => Response | Promise<Response>,
): typeof globalThis.fetch {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    impl(new URL(String(input)), init),
  ) as typeof globalThis.fetch;
}

describe("bounded outbound fetch", () => {
  it("follows redirects only to the allowed host and caps the body", async () => {
    const calls: Array<{ href: string; redirect?: RequestRedirect }> = [];
    const fetcher = fetchMock(async (url, init) => {
      calls.push({ href: url.href, redirect: init?.redirect });
      if (url.pathname === "/start") {
        return new Response(null, {
          status: 302,
          headers: {
            location: "https://www.goodreads.com/review/list_rss/123",
          },
        });
      }
      return new Response("ok");
    });

    await expect(
      fetchTextBounded("https://www.goodreads.com/start", {
        allowedHosts: ["goodreads.com"],
        maxBytes: 10,
        fetch: fetcher,
      }),
    ).resolves.toEqual({ status: 200, ok: true, text: "ok" });
    expect(calls.map((call) => call.redirect)).toEqual(["manual", "manual"]);
  });

  it("refuses redirects to other hosts without following them", async () => {
    const fetcher = fetchMock(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://evil.example/private" },
        }),
    );
    await expect(
      fetchTextBounded(goodreads, {
        allowedHosts: ["goodreads.com"],
        maxBytes: 100,
        fetch: fetcher,
      }),
    ).rejects.toThrow("Redirect target is not allowed.");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not request a disallowed URL", async () => {
    const fetcher = vi.fn();
    await expect(
      fetchTextBounded("https://evil.example/rss", {
        allowedHosts: ["goodreads.com"],
        maxBytes: 100,
        fetch: fetcher as typeof globalThis.fetch,
      }),
    ).rejects.toThrow("Outbound request URL is not allowed.");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("stops reading once the response exceeds the size cap", async () => {
    const fetcher = fetchMock(async () => new Response("x".repeat(50)));
    await expect(
      fetchTextBounded(goodreads, {
        allowedHosts: ["goodreads.com"],
        maxBytes: 10,
        fetch: fetcher,
      }),
    ).rejects.toThrow("size limit");
  });

  it("aborts a slow response at the timeout", async () => {
    const fetcher = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    await expect(
      fetchTextBounded(goodreads, {
        allowedHosts: ["goodreads.com"],
        maxBytes: 100,
        timeoutMs: 20,
        fetch: fetcher as typeof globalThis.fetch,
      }),
    ).rejects.toThrow("timed out");
  });
});
