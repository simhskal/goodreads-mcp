import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { Kysely, PostgresDialect } from "kysely";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

let pool: PGlite;
let database: Kysely<Record<string, never>>;
let auth: typeof import("../src/auth.js").auth;

vi.mock("../src/db.js", () => ({
  getAuthDatabase: () => database,
  getPool: () => pool,
}));

beforeAll(async () => {
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  vi.stubEnv("BETTER_AUTH_SECRET", "test-only-secret-with-no-production-value");
  pool = new PGlite();
  await pool.exec(
    await readFile(
      new URL("../../../migrations/0001_better_auth.sql", import.meta.url),
      "utf8",
    ),
  );
  const client = {
    async query(sql: string, parameters: unknown[] = []) {
      const result = await pool.query(sql, parameters);
      return {
        rows: result.rows,
        rowCount: result.affectedRows ?? result.rows.length,
      };
    },
    release() {},
  };
  database = new Kysely({
    dialect: new PostgresDialect({
      pool: { connect: async () => client, end: async () => {} } as never,
    }),
  });
  ({ auth } = await import("../src/auth.js"));
});

afterAll(async () => {
  await database?.destroy();
  await pool?.close();
  vi.unstubAllEnvs();
});

it("initializes the real auth factory with its Postgres adapter", async () => {
  const context = await auth.$context;
  expect(context.adapter).toBeDefined();
});

it("serves OAuth authorization metadata through the real auth handler", async () => {
  const response = await auth.handler(
    new Request(
      "http://localhost:3000/api/auth/.well-known/oauth-authorization-server",
    ),
  );
  expect(response.status).toBe(200);
  const metadata = await response.json();
  expect(metadata.issuer).toBe("http://localhost:3000/api/auth");
  expect(metadata.scopes_supported).toContain("library:read");
  expect(metadata.code_challenge_methods_supported).toContain("S256");
});
