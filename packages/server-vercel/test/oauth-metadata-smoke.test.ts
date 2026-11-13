import { describe, expect, it } from "vitest";

const base = process.env.OAUTH_SMOKE_BASE_URL?.replace(/\/+$/, "");

// Post-deploy check for the Vercel catch-all miss. A platform 404 has
// `x-vercel-error: NOT_FOUND` and never reaches Better Auth. Run with:
// OAUTH_SMOKE_BASE_URL=https://goodreads-mcp-chi.vercel.app pnpm --filter @goodreads-mcp/server-vercel test test/oauth-metadata-smoke.test.ts
describe.skipIf(!base)("advertised OAuth endpoints", () => {
  it("reaches the app for every endpoint in the metadata", async () => {
    const metadata = await fetch(
      `${base}/.well-known/oauth-authorization-server`,
    );
    expect(metadata.status).toBe(200);
    const document = (await metadata.json()) as Record<string, unknown>;
    const endpoints = Object.entries(document).filter(
      ([key, value]) =>
        (key.endsWith("_endpoint") || key.endsWith("_uri")) &&
        typeof value === "string",
    );
    expect(endpoints.length).toBeGreaterThan(0);

    for (const [key, value] of endpoints) {
      const response = await fetch(value as string, smokeInit(key));
      const text = await response.text();
      expect(response.headers.get("x-vercel-error"), `${key} ${text}`).toBe(
        null,
      );
      expect(text, key).not.toContain("The page could not be found");
    }
  });
});

function smokeInit(key: string): RequestInit {
  if (
    key === "authorization_endpoint" ||
    key === "jwks_uri" ||
    key === "userinfo_endpoint" ||
    key === "end_session_endpoint"
  ) {
    return { method: "GET", redirect: "manual" };
  }
  if (key === "registration_endpoint") {
    return {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        redirect_uris: ["http://127.0.0.1:9/callback"],
        client_name: "smoke-probe",
        token_endpoint_auth_method: "none",
      }),
    };
  }
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  };
}
