import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { htmlPage } from "../src/html.js";

const vercelConfig = JSON.parse(
  readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "../../../vercel.json"),
    "utf8",
  ),
) as {
  headers: { source: string; headers: { key: string; value: string }[] }[];
};

const CANONICAL_ORIGIN = "https://goodreads-mcp-chi.vercel.app";

function headerValue(source: string, key: string): string | undefined {
  return vercelConfig.headers
    .find((entry) => entry.source === source)
    ?.headers.find((header) => header.key === key)?.value;
}

describe("deployment security headers", () => {
  it("sets CSP, nosniff, referrer policy, and frame denial on every route", () => {
    const headers = Object.fromEntries(
      vercelConfig.headers
        .find((entry) => entry.source === "/(.*)")!
        .headers.map((header) => [header.key, header.value]),
    );

    expect(headers["Content-Security-Policy"]).toContain(
      "frame-ancestors 'none'",
    );
    expect(headers["Content-Security-Policy"]).toContain(
      "script-src 'self' 'unsafe-inline'",
    );
    expect(headers["Content-Security-Policy"]).toContain(
      "style-src 'unsafe-inline'",
    );
    expect(headers["Content-Security-Policy"]).toContain("connect-src 'self'");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("no-referrer");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("replaces the static-file wildcard on the landing page", () => {
    for (const source of ["/", "/index.html"]) {
      expect(headerValue(source, "Access-Control-Allow-Origin")).toBe(
        CANONICAL_ORIGIN,
      );
    }
  });

  it("keeps wildcard CORS on authorization-server metadata only", () => {
    const wildcardSources = vercelConfig.headers
      .filter((entry) =>
        entry.headers.some(
          (header) =>
            header.key === "Access-Control-Allow-Origin" &&
            header.value === "*",
        ),
      )
      .map((entry) => entry.source);

    expect(wildcardSources).toEqual([
      "/.well-known/oauth-authorization-server",
      "/.well-known/oauth-authorization-server/(.*)",
      "/api/oauth-authorization-server",
    ]);
  });

  it("keeps oauth page CSP compatible with the edge policy", () => {
    const policy = htmlPage("Title", "<p>Hello</p>").headers.get(
      "content-security-policy",
    );

    expect(policy).toContain("script-src 'unsafe-inline'");
    expect(policy).toContain("style-src 'unsafe-inline'");
    expect(policy).toContain("connect-src 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
  });
});
