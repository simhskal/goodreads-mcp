import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
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

afterEach(async () => {
  await harness.close?.();
  harness.close = undefined;
  harness.query = undefined;
  vi.unstubAllEnvs();
  vi.resetModules();
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
    expect(await response.json()).toMatchObject({
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
  });
});
