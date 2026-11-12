import { afterEach, describe, expect, it, vi } from "vitest";
import { REQUIRED_OAUTH_ENV } from "../src/oauth-guard.js";

const original = Object.fromEntries(
  REQUIRED_OAUTH_ENV.map((name) => [name, process.env[name]]),
);

afterEach(() => {
  for (const name of REQUIRED_OAUTH_ENV) {
    const value = original[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  vi.resetModules();
});

describe("OAuth module boot", () => {
  it("loads without a database and returns 503 instead of throwing", async () => {
    for (const name of REQUIRED_OAUTH_ENV) delete process.env[name];
    vi.resetModules();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const auth = await import("../src/auth.js");
      const index = await import("../src/index.js");
      expect(auth.getAuth).toBeTypeOf("function");
      expect(() => auth.getAuth()).toThrow(/Goodreads MCP OAuth cannot start/);
      expect(() => auth.getAuth()).toThrow(/DATABASE_URL/);
      expect(() => auth.getAuth()).not.toThrow(/DATABASE_URL is required\./);

      const ready = auth.openAuth();
      expect(ready.ok).toBe(false);
      if (ready.ok) return;
      expect(ready.response.status).toBe(503);
      const body = await ready.response.json();
      expect(body.missing).toEqual([...REQUIRED_OAUTH_ENV]);
      expect(index.openAuth).toBeTypeOf("function");

      const metadata =
        await import("../../../api/oauth-authorization-server.js");
      const response = await metadata.GET(
        new Request(
          "https://goodreads-mcp-chi.vercel.app/.well-known/oauth-authorization-server",
        ),
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        error: "oauth_unavailable",
      });
      expect(metadata.OPTIONS().status).toBe(204);
    } finally {
      error.mockRestore();
    }
  });
});
