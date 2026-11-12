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

describe("health endpoint", () => {
  it("reports missing configuration without importing the database", async () => {
    for (const name of REQUIRED_OAUTH_ENV) delete process.env[name];
    vi.resetModules();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const health = await import("../../../api/health.js");
      const response = health.GET();
      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.missing).toEqual([...REQUIRED_OAUTH_ENV]);
      expect(body.message).toContain("BETTER_AUTH_SECRET");
    } finally {
      error.mockRestore();
    }
  });

  it("returns ok when configuration is present and does not connect", async () => {
    process.env.DATABASE_URL = "postgres://db.example/library";
    process.env.BETTER_AUTH_SECRET = "test-secret";
    process.env.BETTER_AUTH_URL = "https://books.example.com";
    process.env.GOODREADS_CREDENTIAL_KEY = Buffer.alloc(32, 3).toString(
      "base64",
    );
    vi.resetModules();
    const health = await import("../../../api/health.js");
    const response = health.GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
