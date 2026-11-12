import { createHash, timingSafeEqual } from "node:crypto";
import { getDatabase } from "./db.js";
import type { Database } from "./repository.js";

const MINUTE = 60;
const HOUR = 60 * 60;

export type AbuseSurface =
  "mcp" | "oauth-mcp" | "connect" | "auth" | "auth-anonymous" | "auth-register";

type LimitDimension = "ip" | "credential" | "global";

export interface AbuseLimit {
  name: string;
  limit: number;
  windowSeconds: number;
  dimension: LimitDimension;
}

export interface RateLimitStore {
  consume(
    bucket: string,
    windowSeconds: number,
    now: Date,
  ): Promise<{ hits: number; resetAt: Date }>;
}

interface RateLimitRow {
  hits: number;
  resetAt: Date | string;
}

const MCP_LIMITS: readonly AbuseLimit[] = [
  { name: "mcp-ip", limit: 120, windowSeconds: MINUTE, dimension: "ip" },
  {
    name: "mcp-credential",
    limit: 240,
    windowSeconds: MINUTE,
    dimension: "credential",
  },
];

const OAUTH_MCP_LIMITS: readonly AbuseLimit[] = [
  {
    name: "oauth-mcp-ip",
    limit: 120,
    windowSeconds: MINUTE,
    dimension: "ip",
  },
  {
    name: "oauth-mcp-credential",
    limit: 240,
    windowSeconds: MINUTE,
    dimension: "credential",
  },
];

const CONNECT_READ_LIMITS: readonly AbuseLimit[] = [
  {
    name: "connect-read-ip",
    limit: 60,
    windowSeconds: MINUTE,
    dimension: "ip",
  },
  {
    name: "connect-read-credential",
    limit: 60,
    windowSeconds: MINUTE,
    dimension: "credential",
  },
];

const CONNECT_WRITE_LIMITS: readonly AbuseLimit[] = [
  {
    name: "connect-write-ip",
    limit: 20,
    windowSeconds: HOUR,
    dimension: "ip",
  },
  {
    name: "connect-write-credential",
    limit: 20,
    windowSeconds: HOUR,
    dimension: "credential",
  },
];

const AUTH_LIMITS: readonly AbuseLimit[] = [
  { name: "auth-ip", limit: 120, windowSeconds: MINUTE, dimension: "ip" },
  {
    name: "auth-credential",
    limit: 180,
    windowSeconds: MINUTE,
    dimension: "credential",
  },
];

const ANONYMOUS_LIMITS: readonly AbuseLimit[] = [
  ...AUTH_LIMITS,
  {
    name: "anonymous-ip-burst",
    limit: 8,
    windowSeconds: MINUTE,
    dimension: "ip",
  },
  { name: "anonymous-ip", limit: 20, windowSeconds: HOUR, dimension: "ip" },
  {
    name: "anonymous-global",
    limit: 1000,
    windowSeconds: HOUR,
    dimension: "global",
  },
];

const REGISTER_LIMITS: readonly AbuseLimit[] = [
  ...AUTH_LIMITS,
  {
    name: "register-ip-burst",
    limit: 10,
    windowSeconds: MINUTE,
    dimension: "ip",
  },
  { name: "register-ip", limit: 30, windowSeconds: HOUR, dimension: "ip" },
  {
    name: "register-global",
    limit: 1000,
    windowSeconds: HOUR,
    dimension: "global",
  },
];

const SESSION_COOKIE_NAMES = [
  "__Secure-better-auth.session_token",
  "better-auth.session_token",
  "__Secure-better-auth-session_token",
  "better-auth-session_token",
] as const;

const IP_HEADERS = [
  "x-vercel-forwarded-for",
  "x-real-ip",
  "x-forwarded-for",
] as const;

export const ABUSE_MATCHER = [
  "/mcp",
  "/mcp/:path*",
  "/api/server",
  "/oauth/mcp",
  "/oauth/mcp/:path*",
  "/api/oauth-mcp",
  "/connect",
  "/api/connect",
  "/api/auth",
  "/api/auth/:path*",
] as const;

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<
    string,
    { hits: number; resetAt: number }
  >();

  async consume(
    bucket: string,
    windowSeconds: number,
    now: Date,
  ): Promise<{ hits: number; resetAt: Date }> {
    const nowMs = now.getTime();
    const current = this.buckets.get(bucket);
    if (!current || current.resetAt <= nowMs) {
      const resetAt = nowMs + windowSeconds * 1000;
      this.buckets.set(bucket, { hits: 1, resetAt });
      return { hits: 1, resetAt: new Date(resetAt) };
    }
    current.hits += 1;
    return { hits: current.hits, resetAt: new Date(current.resetAt) };
  }
}

export class PostgresRateLimitStore implements RateLimitStore {
  constructor(private readonly db: Database) {}

  async consume(
    bucket: string,
    windowSeconds: number,
    now: Date,
  ): Promise<{ hits: number; resetAt: Date }> {
    const resetAt = new Date(now.getTime() + windowSeconds * 1000);
    const result = await this.db.query<RateLimitRow>(
      `INSERT INTO abuse_rate_limits (bucket, hits, reset_at)
       VALUES ($1, 1, $2)
       ON CONFLICT (bucket) DO UPDATE SET
         hits = CASE
           WHEN abuse_rate_limits.reset_at <= $3 THEN 1
           ELSE abuse_rate_limits.hits + 1
         END,
         reset_at = CASE
           WHEN abuse_rate_limits.reset_at <= $3 THEN EXCLUDED.reset_at
           ELSE abuse_rate_limits.reset_at
         END
       RETURNING hits, reset_at AS "resetAt"`,
      [bucket, resetAt, now],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Rate limit update did not return a row.");
    return { hits: Number(row.hits), resetAt: new Date(row.resetAt) };
  }
}

const memoryStore = new MemoryRateLimitStore();
const ABUSE_CHECK_HEADER = "x-goodreads-abuse-check";

export function abuseHandoffSecret(): string | undefined {
  return (
    process.env.ABUSE_MIDDLEWARE_SECRET ||
    process.env.BETTER_AUTH_SECRET ||
    process.env.CRON_SECRET ||
    undefined
  );
}

export function abuseCheckValue(
  method: string,
  pathname: string,
  secret: string,
): string {
  return createHash("sha256")
    .update(`${secret}\n${method.toUpperCase()}\n${normalizePath(pathname)}`)
    .digest("hex");
}

export function requestHasAbuseCheck(
  request: Request,
  secret: string,
): boolean {
  const provided = request.headers.get(ABUSE_CHECK_HEADER);
  if (!provided) return false;
  const expected = abuseCheckValue(
    request.method,
    new URL(request.url).pathname,
    secret,
  );
  const actual = Buffer.from(provided);
  const wanted = Buffer.from(expected);
  if (actual.length !== wanted.length) return false;
  return timingSafeEqual(actual, wanted);
}

export async function guardAbuse(request: Request): Promise<Response | null> {
  const secret = abuseHandoffSecret();
  if (secret && requestHasAbuseCheck(request, secret)) return null;
  return enforceObserved(request, openAbuseStore());
}

export async function enforceObserved(
  request: Request,
  opened: { store: RateLimitStore; persistent: boolean },
): Promise<Response | null> {
  try {
    return await enforceAbuseControl(request, opened.store);
  } catch (error) {
    console.error(
      "Abuse rate limit failed:",
      error instanceof Error ? error.message : "unknown",
    );
    const surface = abuseSurface(new URL(request.url).pathname);
    if (opened.persistent && surface === "mcp") {
      try {
        return await enforceAbuseControl(request, memoryStore);
      } catch (fallbackError) {
        console.error(
          "Abuse rate limit fallback failed:",
          fallbackError instanceof Error ? fallbackError.message : "unknown",
        );
      }
    }
    if (!surface || request.method.toUpperCase() === "OPTIONS") return null;
    return abuseUnavailable();
  }
}

export function openAbuseStore(): {
  store: RateLimitStore;
  persistent: boolean;
} {
  if (!process.env.DATABASE_URL)
    return { store: memoryStore, persistent: false };
  return {
    store: new PostgresRateLimitStore(getDatabase()),
    persistent: true,
  };
}

export function abuseSurface(pathname: string): AbuseSurface | null {
  const path = normalizePath(pathname);
  if (path === "/api/auth/sign-in/anonymous") return "auth-anonymous";
  if (
    path === "/api/auth/oauth2/register" ||
    path.startsWith("/api/auth/oauth2/register/")
  ) {
    return "auth-register";
  }
  if (path === "/api/auth" || path.startsWith("/api/auth/")) return "auth";
  if (path === "/mcp" || path.startsWith("/mcp/") || path === "/api/server") {
    return "mcp";
  }
  if (
    path === "/oauth/mcp" ||
    path.startsWith("/oauth/mcp/") ||
    path === "/api/oauth-mcp"
  ) {
    return "oauth-mcp";
  }
  if (path === "/connect" || path === "/api/connect") return "connect";
  return null;
}

export function applicableLimits(
  pathname: string,
  method: string,
): readonly AbuseLimit[] {
  const surface = abuseSurface(pathname);
  if (!surface) return [];
  return limitsForSurface(surface, method.toUpperCase());
}

export function clientIp(headers: Headers): string {
  for (const name of IP_HEADERS) {
    const ip = firstIp(headers.get(name));
    if (ip) return ip;
  }
  return "unknown";
}

export async function enforceAbuseControl(
  request: Request,
  store: RateLimitStore,
  now = new Date(),
): Promise<Response | null> {
  if (request.method.toUpperCase() === "OPTIONS") return null;
  const surface = abuseSurface(new URL(request.url).pathname);
  if (!surface) return null;
  const credential = credentialForRequest(surface, request.headers);
  const ip = clientIp(request.headers);
  let blocked = false;
  let retryAfterSeconds = 0;
  for (const limit of limitsForSurface(surface, request.method.toUpperCase())) {
    const subject = bucketSubject(limit.dimension, ip, credential);
    if (!subject) continue;
    const usage = await store.consume(
      `${limit.name}:${limit.dimension}:${subject}`,
      limit.windowSeconds,
      now,
    );
    if (usage.hits > limit.limit) {
      blocked = true;
      retryAfterSeconds = Math.max(
        retryAfterSeconds,
        secondsUntil(usage.resetAt, now),
      );
    }
  }
  if (!blocked) return null;
  return tooManyRequests(retryAfterSeconds);
}

export function abuseUnavailable(): Response {
  return Response.json(
    { error: "Service temporarily unavailable." },
    { status: 503, headers: { "cache-control": "no-store" } },
  );
}

function limitsForSurface(
  surface: AbuseSurface,
  method: string,
): readonly AbuseLimit[] {
  switch (surface) {
    case "mcp":
      return MCP_LIMITS;
    case "oauth-mcp":
      return OAUTH_MCP_LIMITS;
    case "connect":
      return method === "GET" || method === "HEAD"
        ? CONNECT_READ_LIMITS
        : CONNECT_WRITE_LIMITS;
    case "auth":
      return AUTH_LIMITS;
    case "auth-anonymous":
      return ANONYMOUS_LIMITS;
    case "auth-register":
      return REGISTER_LIMITS;
    default: {
      const unhandled: never = surface;
      return unhandled;
    }
  }
}

function bucketSubject(
  dimension: LimitDimension,
  ip: string,
  credential: string | null,
): string | null {
  switch (dimension) {
    case "ip":
      return ip;
    case "credential":
      return credential ? digestCredential(credential) : null;
    case "global":
      return "all";
    default: {
      const unhandled: never = dimension;
      return unhandled;
    }
  }
}

function credentialForRequest(
  surface: AbuseSurface,
  headers: Headers,
): string | null {
  switch (surface) {
    case "mcp": {
      const userId = headers.get("x-goodreads-user-id")?.trim();
      return userId ? `goodreads-user:${userId}` : null;
    }
    case "oauth-mcp": {
      const bearer = bearerToken(headers.get("authorization"));
      return bearer ? `bearer:${bearer}` : null;
    }
    case "connect":
    case "auth":
    case "auth-anonymous":
    case "auth-register":
      return sessionOrBearer(headers);
    default: {
      const unhandled: never = surface;
      return unhandled;
    }
  }
}

function sessionOrBearer(headers: Headers): string | null {
  const session = cookieValue(headers.get("cookie"), SESSION_COOKIE_NAMES);
  if (session) return `session:${session}`;
  const bearer = bearerToken(headers.get("authorization"));
  return bearer ? `bearer:${bearer}` : null;
}

function bearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
  return match?.[1] ?? null;
}

function cookieValue(
  header: string | null,
  names: readonly string[],
): string | null {
  if (!header) return null;
  const wanted = new Set(names);
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const name = trimmed.slice(0, separator);
    if (!wanted.has(name)) continue;
    const value = trimmed.slice(separator + 1);
    if (!value) continue;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

function firstIp(header: string | null): string | null {
  if (!header) return null;
  const candidate = header.split(",")[0]?.trim() ?? "";
  if (!candidate || candidate.length > 128) return null;
  if (!/^[A-Za-z0-9:.]+$/.test(candidate)) return null;
  return candidate;
}

function digestCredential(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function secondsUntil(resetAt: Date, now: Date): number {
  return Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1000));
}

function tooManyRequests(retryAfterSeconds: number): Response {
  return Response.json(
    { error: "Too many requests. Try again later." },
    {
      status: 429,
      headers: {
        "cache-control": "no-store",
        "retry-after": String(retryAfterSeconds),
      },
    },
  );
}
