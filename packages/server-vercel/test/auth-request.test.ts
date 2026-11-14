import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { requestForAuth } from "../src/auth-request.js";

const ORIGIN = "https://books.example.com";

describe("requestForAuth", () => {
  it("restores the public path from the Vercel rewrite", async () => {
    const request = new Request(
      `${ORIGIN}/api/auth/[...all]?authPath=oauth2%2Fregister&unused=1`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goodreads-abuse-check": "handoff",
        },
        body: JSON.stringify({
          redirect_uris: ["http://127.0.0.1:9/callback"],
          client_name: "probe",
          token_endpoint_auth_method: "none",
        }),
      },
    );

    const restored = requestForAuth(request);
    const url = new URL(restored.url);
    expect(url.pathname).toBe("/api/auth/oauth2/register");
    expect(url.searchParams.has("authPath")).toBe(false);
    expect(url.searchParams.get("unused")).toBe("1");
    expect(restored.method).toBe("POST");
    expect(restored.headers.get("x-goodreads-abuse-check")).toBe("handoff");
    expect(await restored.json()).toMatchObject({ client_name: "probe" });
  });

  it("keeps authorize query parameters other than the rewrite suffix", () => {
    const request = new Request(
      `${ORIGIN}/api/auth/%5B...all%5D?authPath=oauth2/authorize&client_id=client-1&code_challenge=abc`,
    );
    const url = new URL(requestForAuth(request).url);
    expect(url.pathname).toBe("/api/auth/oauth2/authorize");
    expect(url.searchParams.get("client_id")).toBe("client-1");
    expect(url.searchParams.get("code_challenge")).toBe("abc");
    expect(url.searchParams.has("authPath")).toBe(false);
  });

  it("leaves a one-segment auth route on its public URL", () => {
    const request = new Request(`${ORIGIN}/api/auth/jwks?authPath=jwks`);
    expect(requestForAuth(request).url).toBe(request.url);
  });

  it("maps an empty suffix to the auth base path", () => {
    const request = new Request(`${ORIGIN}/api/auth/[...all]?authPath=`);
    expect(new URL(requestForAuth(request).url).pathname).toBe("/api/auth");
  });
});

describe("vercel auth rewrites", () => {
  const vercel = JSON.parse(
    readFileSync(new URL("../../../vercel.json", import.meta.url), "utf8"),
  ) as {
    rewrites: Array<{ source: string; destination: string }>;
  };

  it("sends nested /api/auth paths to the catch-all function", () => {
    const rewrite = vercel.rewrites.find(
      (entry) => entry.destination === "/api/auth/[...all]",
    );
    expect(rewrite?.source).toBe("/api/auth/:authPath*");

    for (const path of [
      "/api/auth/oauth2/authorize",
      "/api/auth/oauth2/token",
      "/api/auth/oauth2/register",
      "/api/auth/oauth2/register/client-1",
      "/api/auth/oauth2/userinfo",
      "/api/auth/oauth2/revoke",
      "/api/auth/oauth2/introspect",
      "/api/auth/oauth2/end-session",
      "/api/auth/oauth2/continue",
      "/api/auth/oauth2/consent",
      "/api/auth/sign-in/anonymous",
    ]) {
      expect(matchesAuthRewrite(rewrite!.source, path)).toBe(true);
    }
    expect(matchesAuthRewrite(rewrite!.source, "/api/auth/jwks")).toBe(true);
    expect(matchesAuthRewrite(rewrite!.source, "/oauth/mcp")).toBe(false);
  });
});

function matchesAuthRewrite(source: string, pathname: string): boolean {
  if (source !== "/api/auth/:authPath*") {
    throw new Error(`Unsupported auth rewrite source: ${source}`);
  }
  const match = /^\/api\/auth(?:\/((?:[^/]+?)(?:\/(?:[^/]+?))*))?$/.exec(
    pathname,
  );
  return match != null && match[1] != null;
}
