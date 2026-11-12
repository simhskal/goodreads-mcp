import { afterEach, describe, expect, it, vi } from "vitest";
import {
  missingOAuthEnv,
  oauthConfigMessage,
  oauthUnavailableResponse,
  REQUIRED_OAUTH_ENV,
} from "../src/oauth-guard.js";

const original = Object.fromEntries(
  REQUIRED_OAUTH_ENV.map((name) => [name, process.env[name]]),
);

afterEach(() => {
  for (const name of REQUIRED_OAUTH_ENV) {
    const value = original[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("OAuth environment guard", () => {
  it("names every required variable in the boot message", () => {
    for (const name of REQUIRED_OAUTH_ENV) delete process.env[name];
    expect(missingOAuthEnv()).toEqual([...REQUIRED_OAUTH_ENV]);
    const message = oauthConfigMessage(missingOAuthEnv());
    for (const name of REQUIRED_OAUTH_ENV) expect(message).toContain(name);
    expect(message).toContain("Supabase");
    expect(message).toContain("Schema migrations run during deploy");
    expect(message).not.toMatch(/postgres(?:ql)?:\/\//);
  });

  it("returns 503 without opening a database when configuration is missing", async () => {
    for (const name of REQUIRED_OAUTH_ENV) delete process.env[name];
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = oauthUnavailableResponse();
    error.mockRestore();
    expect(response?.status).toBe(503);
    const body = await response?.json();
    expect(body.error).toBe("oauth_unavailable");
    expect(body.missing).toEqual([...REQUIRED_OAUTH_ENV]);
  });

  it("reports only the variables that are still unset", async () => {
    for (const name of REQUIRED_OAUTH_ENV) delete process.env[name];
    process.env.DATABASE_URL = "postgres://db.example/library";
    process.env.BETTER_AUTH_URL = "https://books.example.com";
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = oauthUnavailableResponse();
    error.mockRestore();
    const body = await response?.json();
    expect(body.missing).toEqual([
      "BETTER_AUTH_SECRET",
      "GOODREADS_CREDENTIAL_KEY",
    ]);
    expect(body.message).not.toContain("postgres://db.example/library");
  });

  it("stays quiet when the required variables are present", () => {
    process.env.DATABASE_URL = "postgres://db.example/library";
    process.env.BETTER_AUTH_SECRET = "test-secret";
    process.env.BETTER_AUTH_URL = "https://books.example.com";
    process.env.GOODREADS_CREDENTIAL_KEY = "a2V5";
    expect(oauthUnavailableResponse()).toBeUndefined();
  });
});
