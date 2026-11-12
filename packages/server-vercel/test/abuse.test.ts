import { describe, expect, it } from "vitest";
import middleware, { config as middlewareConfig } from "../../../middleware.js";
import {
  ABUSE_MATCHER,
  MemoryRateLimitStore,
  PostgresRateLimitStore,
  abuseCheckValue,
  applicableLimits,
  clientIp,
  enforceAbuseControl,
  guardAbuse,
  requestHasAbuseCheck,
  type AbuseLimit,
  type RateLimitStore,
} from "../src/abuse.js";
import { isCronAuthorized } from "../src/cron-auth.js";
import { hoursFromEnv, purgeCutoffs } from "../src/purge.js";
import { createTestDatabase } from "./postgres.js";

const NOW = new Date("2026-01-15T12:00:00.000Z");
const RSS_KEY = "rss-secret-do-not-store";
const ACCESS_TOKEN = "access-token-do-not-store";

describe("abuse limits", () => {
  it("limits the hosted entry points per IP and per credential", () => {
    expect(names("/mcp", "POST")).toEqual(["mcp-ip", "mcp-credential"]);
    expect(names("/api/server", "GET")).toEqual(["mcp-ip", "mcp-credential"]);
    expect(names("/oauth/mcp", "POST")).toEqual([
      "oauth-mcp-ip",
      "oauth-mcp-credential",
    ]);
    expect(names("/connect", "GET")).toEqual([
      "connect-read-ip",
      "connect-read-credential",
    ]);
    expect(names("/api/connect", "POST")).toEqual([
      "connect-write-ip",
      "connect-write-credential",
    ]);
    expect(names("/api/auth/oauth2/token", "POST")).toEqual([
      "auth-ip",
      "auth-credential",
    ]);
    expect(names("/api/auth/sign-in/anonymous", "POST")).toEqual([
      "auth-ip",
      "auth-credential",
      "anonymous-ip-burst",
      "anonymous-ip",
      "anonymous-global",
    ]);
    expect(names("/api/auth/oauth2/register", "POST")).toContain("register-ip");
    expect(names("/api/auth/oauth2/register/client-1", "POST")).toContain(
      "register-ip",
    );
    expect(names("/sign-in", "GET")).toEqual([]);
    expect(ABUSE_MATCHER).toEqual(
      expect.arrayContaining([
        "/mcp",
        "/oauth/mcp",
        "/api/auth/:path*",
        "/connect",
      ]),
    );
    expect(middlewareConfig.matcher).toEqual([...ABUSE_MATCHER]);
  });

  it("prefers the Vercel client IP and ignores credential secrets", async () => {
    const store = new RecordingStore();
    const response = await enforceAbuseControl(
      request("/mcp", {
        "x-vercel-forwarded-for": "198.51.100.10, 10.0.0.8",
        "x-forwarded-for": "203.0.113.5",
        "x-goodreads-user-id": "10001",
        "x-goodreads-rss-key": RSS_KEY,
      }),
      store,
      NOW,
    );

    expect(response).toBeNull();
    expect(store.buckets).toContain("mcp-ip:ip:198.51.100.10");
    expect(store.buckets.join(" ")).not.toContain("203.0.113.5");
    expect(store.buckets.join(" ")).not.toContain("10001");
    expect(store.buckets.join(" ")).not.toContain(RSS_KEY);
    expect(clientIp(headers({ "x-real-ip": "192.0.2.15" }))).toBe("192.0.2.15");
    expect(clientIp(headers({ "x-forwarded-for": "not an ip" }))).toBe(
      "unknown",
    );
  });

  it("throttles anonymous sign-in and resets the burst window", async () => {
    const store = new MemoryRateLimitStore();
    const burst = limit(
      "/api/auth/sign-in/anonymous",
      "POST",
      "anonymous-ip-burst",
    );
    const call = (now: Date) =>
      enforceAbuseControl(
        request("/api/auth/sign-in/anonymous/", {
          "x-real-ip": "203.0.113.8",
          cookie: "better-auth.session_token=session-secret",
        }),
        store,
        now,
      );

    for (let attempt = 0; attempt < burst.limit; attempt += 1) {
      await expect(call(NOW)).resolves.toBeNull();
    }
    const denied = await call(NOW);
    expect(denied?.status).toBe(429);
    expect(denied?.headers.get("retry-after")).toBe(
      String(burst.windowSeconds),
    );
    await expect(denied?.json()).resolves.toEqual({
      error: "Too many requests. Try again later.",
    });

    const later = new Date(NOW.getTime() + (burst.windowSeconds + 1) * 1000);
    await expect(call(later)).resolves.toBeNull();
  });

  it("limits one OAuth credential across source IPs", async () => {
    const store = new MemoryRateLimitStore();
    const credential = limit("/oauth/mcp", "POST", "oauth-mcp-credential");
    const call = (ip: string, now: Date) =>
      enforceAbuseControl(
        request(
          "/oauth/mcp",
          {
            "x-real-ip": ip,
            authorization: `Bearer ${ACCESS_TOKEN}`,
          },
          "POST",
        ),
        store,
        now,
      );

    for (let attempt = 0; attempt < credential.limit; attempt += 1) {
      await expect(call(testIp(attempt), NOW)).resolves.toBeNull();
    }
    const denied = await call(testIp(credential.limit), NOW);
    expect(denied?.status).toBe(429);
  });

  it("does not count CORS preflight toward the limit", async () => {
    const store = new RecordingStore();
    const response = await enforceAbuseControl(
      request(
        "/api/auth/sign-in/anonymous",
        { "x-real-ip": "192.0.2.8" },
        "OPTIONS",
      ),
      store,
      NOW,
    );
    expect(response).toBeNull();
    expect(store.buckets).toEqual([]);
  });

  it("stores fixed windows in Postgres and starts a new window when one expires", async () => {
    const { pg, db } = await createTestDatabase();
    const store = new PostgresRateLimitStore(db);
    const first = await store.consume("mcp-ip:ip:192.0.2.9", 60, NOW);
    const second = await store.consume("mcp-ip:ip:192.0.2.9", 60, NOW);
    expect(first.hits).toBe(1);
    expect(second.hits).toBe(2);

    await pg.query(
      "UPDATE abuse_rate_limits SET reset_at = $1 WHERE bucket = $2",
      [new Date(NOW.getTime() - 1000), "mcp-ip:ip:192.0.2.9"],
    );
    const reset = await store.consume("mcp-ip:ip:192.0.2.9", 60, NOW);
    expect(reset.hits).toBe(1);
    expect(reset.resetAt.getTime()).toBe(NOW.getTime() + 60_000);
  });
});

describe("abuse middleware", () => {
  it.skipIf(Boolean(process.env.DATABASE_URL))(
    "stops anonymous sign-in after the per-IP burst",
    async () => {
      const previous = process.env.ABUSE_MIDDLEWARE_SECRET;
      process.env.ABUSE_MIDDLEWARE_SECRET = "middleware-test-secret";
      try {
        const burst = limit(
          "/api/auth/sign-in/anonymous",
          "POST",
          "anonymous-ip-burst",
        );
        const call = () =>
          middleware(
            request("/api/auth/sign-in/anonymous", {
              "x-real-ip": "192.0.2.77",
            }),
          );
        for (let attempt = 0; attempt < burst.limit; attempt += 1) {
          const response = await call();
          expect(response.headers.get("x-middleware-next")).toBe("1");
          expect(
            response.headers.get(
              "x-middleware-request-x-goodreads-abuse-check",
            ),
          ).toBeTruthy();
        }
        const denied = await call();
        expect(denied.status).toBe(429);
        expect(denied.headers.get("x-middleware-next")).toBeNull();
      } finally {
        restoreEnv("ABUSE_MIDDLEWARE_SECRET", previous);
      }
    },
  );
});

describe("handler handoff", () => {
  it("accepts the middleware mark only for the same request", () => {
    const secret = "handoff-secret";
    const path = "/api/connect";
    const signed = request(path, {
      "x-goodreads-abuse-check": abuseCheckValue("POST", path, secret),
    });
    expect(requestHasAbuseCheck(signed, secret)).toBe(true);
    expect(requestHasAbuseCheck(signed, "other-secret")).toBe(false);
    const otherPath = request("/mcp", {
      "x-goodreads-abuse-check": abuseCheckValue("POST", path, secret),
    });
    expect(requestHasAbuseCheck(otherPath, secret)).toBe(false);
  });

  it.skipIf(Boolean(process.env.DATABASE_URL))(
    "does not count a request middleware already limited",
    async () => {
      const previous = process.env.ABUSE_MIDDLEWARE_SECRET;
      process.env.ABUSE_MIDDLEWARE_SECRET = "handoff-secret";
      try {
        const path = "/api/auth/sign-in/anonymous";
        const headers = {
          "x-real-ip": "192.0.2.21",
          "x-goodreads-abuse-check": abuseCheckValue(
            "POST",
            path,
            "handoff-secret",
          ),
        };
        for (let attempt = 0; attempt < 30; attempt += 1) {
          await expect(guardAbuse(request(path, headers))).resolves.toBeNull();
        }
        await expect(
          guardAbuse(request(path, { "x-real-ip": "192.0.2.21" })),
        ).resolves.toBeNull();
      } finally {
        restoreEnv("ABUSE_MIDDLEWARE_SECRET", previous);
      }
    },
  );
});

describe("account retention settings", () => {
  it("authorizes the cron caller with the configured secret", () => {
    expect(isCronAuthorized(null, "cron-secret")).toBe(false);
    expect(isCronAuthorized("Bearer cron-secret", undefined)).toBe(false);
    expect(isCronAuthorized("Bearer wrong", "cron-secret")).toBe(false);
    expect(isCronAuthorized("Bearer cron-secret", "cron-secret")).toBe(true);
  });

  it("reads retention windows from the environment", () => {
    const previousAnonymous = process.env.ABUSE_ANONYMOUS_TTL_HOURS;
    const previousClients = process.env.ABUSE_OAUTH_CLIENT_TTL_HOURS;
    process.env.ABUSE_ANONYMOUS_TTL_HOURS = "48";
    process.env.ABUSE_OAUTH_CLIENT_TTL_HOURS = "nope";
    try {
      expect(hoursFromEnv("ABUSE_ANONYMOUS_TTL_HOURS", 24)).toBe(48);
      expect(hoursFromEnv("ABUSE_OAUTH_CLIENT_TTL_HOURS", 24 * 7)).toBe(24 * 7);
      const cutoffs = purgeCutoffs(NOW);
      expect(cutoffs.anonymousUsers.toISOString()).toBe(
        "2026-01-13T12:00:00.000Z",
      );
      expect(cutoffs.oauthClients.toISOString()).toBe(
        "2026-01-08T12:00:00.000Z",
      );
    } finally {
      restoreEnv("ABUSE_ANONYMOUS_TTL_HOURS", previousAnonymous);
      restoreEnv("ABUSE_OAUTH_CLIENT_TTL_HOURS", previousClients);
    }
  });
});

class RecordingStore implements RateLimitStore {
  readonly buckets: string[] = [];

  async consume(
    bucket: string,
    windowSeconds: number,
    now: Date,
  ): Promise<{ hits: number; resetAt: Date }> {
    this.buckets.push(bucket);
    return {
      hits: 1,
      resetAt: new Date(now.getTime() + windowSeconds * 1000),
    };
  }
}

function names(pathname: string, method: string): string[] {
  return applicableLimits(pathname, method).map((item) => item.name);
}

function limit(pathname: string, method: string, name: string): AbuseLimit {
  const found = applicableLimits(pathname, method).find(
    (item) => item.name === name,
  );
  if (!found) throw new Error(`Missing abuse limit ${name}.`);
  return found;
}

function request(
  pathname: string,
  initHeaders: Record<string, string>,
  method = "POST",
): Request {
  return new Request(`https://books.example${pathname}`, {
    method,
    headers: initHeaders,
  });
}

function headers(initHeaders: Record<string, string>): Headers {
  return new Headers(initHeaders);
}

function testIp(index: number): string {
  return `10.${(index >> 16) & 255}.${(index >> 8) & 255}.${index & 255}`;
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
