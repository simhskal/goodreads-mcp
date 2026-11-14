import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type { PoolConfig } from "pg";

// Better Auth decides how to build its adapter by duck-typing the `database`
// value. This stands in for the runtime `pg.Pool` with an in-memory Postgres
// so the metadata request can initialize that adapter and run a query.
// `vi.mock` is hoisted above imports, so the stand-in loads its dependencies
// inside the factory.
const harness = vi.hoisted(() => ({
  query: undefined as
    | ((sql: string) => Promise<{ rows: Array<{ identifier: string }> }>)
    | undefined,
  close: undefined as (() => Promise<void>) | undefined,
}));

vi.mock("pg", async () => {
  const actual = await vi.importActual<typeof import("pg")>("pg");
  const { PGlite } = await import("@electric-sql/pglite");
  const { createPgConfig } = await import("@electric-sql/pglite/node-postgres");
  const database = new PGlite();
  for (const name of [
    "0001_better_auth.sql",
    "0002_goodreads_storage.sql",
    "0003_abuse_controls.sql",
  ]) {
    const sql = await readFile(
      fileURLToPath(new URL(`../../../migrations/${name}`, import.meta.url)),
      "utf8",
    );
    await database.exec(sql);
  }
  harness.query = (sql) => database.query(sql);
  harness.close = () => database.close();

  class PglitePool extends actual.Pool {
    constructor(_config?: PoolConfig) {
      super(
        Object.assign(createPgConfig(database), {
          max: 1,
        }) as PoolConfig,
      );
    }
  }

  return { default: { Pool: PglitePool }, Pool: PglitePool };
});

const env = {
  DATABASE_URL:
    "postgres://reader:secret@aws-1-us-west-1.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x",
  BETTER_AUTH_SECRET: "x".repeat(48),
  BETTER_AUTH_URL: "https://books.example.com",
  GOODREADS_CREDENTIAL_KEY: Buffer.alloc(32, 4).toString("base64"),
} as const;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

afterAll(async () => {
  await harness.close?.();
});

describe("Better Auth pg adapter", () => {
  it("serves authorization server metadata through a pg pool", async () => {
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    vi.resetModules();

    const metadata = await import("../../../api/oauth-authorization-server.js");
    const response = await metadata.GET(
      new Request(
        "https://books.example.com/.well-known/oauth-authorization-server",
      ),
    );
    expect(response.status).toBe(200);
    const document = (await response.json()) as Record<string, unknown>;
    expect(document).toMatchObject({
      issuer: "https://books.example.com/api/auth",
      authorization_endpoint:
        "https://books.example.com/api/auth/oauth2/authorize",
      token_endpoint: "https://books.example.com/api/auth/oauth2/token",
    });

    const auth = await import("../src/auth.js");
    const ok = await auth
      .getAuth()
      .handler(new Request("https://books.example.com/api/auth/ok"));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true });

    const seeded = await harness.query?.(
      `select "identifier" from "oauthResource"`,
    );
    expect(seeded?.rows.map((row) => row.identifier)).toContain(
      "https://books.example.com/oauth/mcp",
    );

    await expectAdvertisedPathsReachAuth(document);
  });

  it("completes dynamic registration, PKCE, and an authenticated MCP initialize", async () => {
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    vi.resetModules();

    const auth = (await import("../src/auth.js")).getAuth();
    const jar = new CookieJar();
    const redirectUri = "http://127.0.0.1:9/callback";
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const resource = "https://books.example.com/oauth/mcp";

    const registered = await callAuth(auth, jar, "/api/auth/oauth2/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        redirect_uris: [redirectUri],
        client_name: "probe",
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      }),
    });
    expect(registered.status, await registered.clone().text()).toBe(201);
    const client = (await registered.json()) as { client_id?: string };
    expect(client.client_id).toEqual(expect.any(String));

    const authorize = await callAuth(
      auth,
      jar,
      `/api/auth/oauth2/authorize?${new URLSearchParams({
        response_type: "code",
        client_id: client.client_id!,
        redirect_uri: redirectUri,
        code_challenge: challenge,
        code_challenge_method: "S256",
        state: "state-1",
        scope: "openid profile offline_access library:read",
        resource,
      })}`,
    );
    expect(authorize.status, await authorize.clone().text()).toBe(302);
    const signIn = new URL(
      authorize.headers.get("location") ?? "",
      "https://books.example.com",
    );
    expect(signIn.pathname).toBe("/sign-in");
    const oauthQuery = pageQuery(signIn);
    expect(oauthQuery, signIn.href).toContain("sig=");

    const anonymous = await callAuth(auth, jar, "/api/auth/sign-in/anonymous", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ oauth_query: oauthQuery }),
    });
    const anonymousText = await anonymous.clone().text();
    expect(anonymous.status, anonymousText).toBe(200);
    const session = JSON.parse(anonymousText) as { url?: string };
    expect(session.url, anonymousText).toEqual(expect.any(String));
    let next = new URL(session.url!, "https://books.example.com");
    if (next.pathname === "/connect") {
      const connect = await import("../../../api/connect.js");
      const form = new FormData();
      form.set("profile", "42424242");
      const saved = await connect.POST(
        new Request(next.href, {
          method: "POST",
          headers: { cookie: jar.header() },
          body: form,
        }),
      );
      jar.absorb(saved);
      expect(saved.status, await saved.clone().text()).toBe(200);
      next = await continueOAuth(auth, jar, pageQuery(next), true);
    }

    if (next.pathname === "/consent") {
      const consent = await callAuth(auth, jar, "/api/auth/oauth2/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accept: true,
          oauth_query: pageQuery(next),
        }),
      });
      expect(consent.status, await consent.clone().text()).toBe(200);
      const consented = (await consent.json()) as { url?: string };
      next = new URL(consented.url ?? "", "https://books.example.com");
    }

    const code = next.searchParams.get("code");
    expect(code, next.toString()).toEqual(expect.any(String));

    const token = await callAuth(auth, jar, "/api/auth/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code!,
        redirect_uri: redirectUri,
        client_id: client.client_id!,
        code_verifier: verifier,
        resource,
      }),
    });
    expect(token.status, await token.clone().text()).toBe(200);
    const access = (await token.json()) as { access_token?: string };
    expect(access.access_token).toEqual(expect.any(String));

    const realFetch = globalThis.fetch.bind(globalThis);
    vi.stubGlobal(
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          input instanceof Request
            ? input.url
            : input instanceof URL
              ? input.toString()
              : String(input);
        if (url.startsWith("https://books.example.com/")) {
          return auth.handler(new Request(url, init));
        }
        return realFetch(input, init);
      },
    );

    const mcp = await import("../../../api/oauth-mcp.js");
    const initialized = await mcp.POST(
      new Request("https://books.example.com/oauth/mcp", {
        method: "POST",
        headers: {
          authorization: `Bearer ${access.access_token}`,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "probe", version: "0" },
          },
        }),
      }),
    );
    const body = await initialized.text();
    expect(initialized.status, body).toBe(200);
    expect(body).toContain("goodreads-mcp");
  });
});

async function expectAdvertisedPathsReachAuth(
  document: Record<string, unknown>,
): Promise<void> {
  const vercel = JSON.parse(
    await readFile(
      fileURLToPath(new URL("../../../vercel.json", import.meta.url)),
      "utf8",
    ),
  ) as { rewrites: Array<{ source: string; destination: string }> };
  const rewrite = vercel.rewrites.find(
    (entry) => entry.destination === "/api/auth/[...all]",
  );
  expect(rewrite?.source).toBe("/api/auth/:authPath*");

  const endpoints = Object.entries(document).filter(
    ([key, value]) =>
      (key.endsWith("_endpoint") || key.endsWith("_uri")) &&
      typeof value === "string",
  );
  expect(endpoints.map(([key]) => key)).toEqual(
    expect.arrayContaining([
      "authorization_endpoint",
      "token_endpoint",
      "registration_endpoint",
      "jwks_uri",
      "userinfo_endpoint",
      "revocation_endpoint",
    ]),
  );

  const route = await import("../../../api/auth/[...all].js");
  for (const [key, value] of endpoints) {
    const url = new URL(value as string);
    const segments = url.pathname.split("/").filter(Boolean);
    expect(segments[0]).toBe("api");
    expect(segments[1]).toBe("auth");
    if (segments.length >= 4) {
      const suffix = segments.slice(2).join("/");
      const rewritten = await route.POST(
        new Request(
          `https://books.example.com/api/auth/[...all]?authPath=${encodeURIComponent(suffix)}`,
          advertisedInit(key),
        ),
      );
      const text = await rewritten.text();
      expect(rewritten.headers.get("x-vercel-error"), `${key} ${text}`).toBe(
        null,
      );
      expect(text).not.toContain("The page could not be found");
      expect(rewritten.status, `${key} ${text}`).not.toBe(404);
    }
  }
}

function advertisedInit(key: string): RequestInit {
  if (
    key === "authorization_endpoint" ||
    key === "jwks_uri" ||
    key.endsWith("_uri")
  ) {
    return { method: "GET" };
  }
  if (key === "registration_endpoint") {
    return {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        redirect_uris: ["http://127.0.0.1:9/callback"],
        client_name: "routing-probe",
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

class CookieJar {
  private readonly cookies = new Map<string, string>();

  absorb(response: Response): void {
    const listed =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : [];
    for (const raw of listed) {
      const pair = raw.split(";", 1)[0] ?? "";
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  header(): string {
    return [...this.cookies]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }
}

async function callAuth(
  auth: { handler: (request: Request) => Promise<Response> },
  jar: CookieJar,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const cookie = jar.header();
  if (cookie) headers.set("cookie", cookie);
  const response = await auth.handler(
    new Request(new URL(path, "https://books.example.com"), {
      ...init,
      headers,
      redirect: "manual",
    }),
  );
  jar.absorb(response);
  return response;
}

function pageQuery(url: URL): string {
  return url.searchParams.get("oauth_query") ?? url.search.replace(/^\?/, "");
}

async function continueOAuth(
  auth: { handler: (request: Request) => Promise<Response> },
  jar: CookieJar,
  oauthQuery: string,
  postLogin = false,
): Promise<URL> {
  const response = await callAuth(auth, jar, "/api/auth/oauth2/continue", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(
      postLogin
        ? { postLogin: true, oauth_query: oauthQuery }
        : { oauth_query: oauthQuery },
    ),
  });
  expect(response.status, await response.clone().text()).toBe(200);
  const result = (await response.json()) as { url?: string };
  return new URL(result.url ?? "", "https://books.example.com");
}
