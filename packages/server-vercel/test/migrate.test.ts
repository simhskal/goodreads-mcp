import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import type { ClientConfig } from "pg";
import {
  applyMigrations,
  MIGRATION_SKIP_MESSAGE,
  migrationResultMessage,
  readMigrationFiles,
  runMigrationsFromEnv,
  selectMigrationTarget,
  type MigrationClient,
  type MigrationConnector,
} from "../src/migrate.js";

describe("migration target", () => {
  it("prefers the session-mode URL and falls back to DATABASE_URL", () => {
    expect(
      selectMigrationTarget({
        POSTGRES_URL_NON_POOLING: " postgres://session/library ",
        DATABASE_URL: "postgres://pooled/library",
      })?.source,
    ).toBe("POSTGRES_URL_NON_POOLING");
    expect(
      selectMigrationTarget({
        POSTGRES_URL_NON_POOLING: "   ",
        DATABASE_URL: "postgres://pooled/library",
      })?.source,
    ).toBe("DATABASE_URL");
    expect(
      selectMigrationTarget({
        POSTGRES_URL_NON_POOLING: "",
        DATABASE_URL: " ",
      }),
    ).toBeUndefined();
  });

  it("describes the result without the connection string", () => {
    const secret =
      "postgres://user:s3cret@db.example/library?supa=base-pooler.x";
    expect(
      migrationResultMessage("DATABASE_URL", {
        applied: ["0001_better_auth.sql"],
        skipped: [],
      }),
    ).toBe(
      "Applied database migrations using DATABASE_URL: 0001_better_auth.sql.",
    );
    expect(
      migrationResultMessage("POSTGRES_URL_NON_POOLING", {
        applied: [],
        skipped: ["0001_better_auth.sql"],
      }),
    ).toBe(
      "Database migrations already applied using POSTGRES_URL_NON_POOLING.",
    );
    expect(
      migrationResultMessage("DATABASE_URL", {
        applied: ["0003_abuse_controls.sql"],
        skipped: ["0001_better_auth.sql"],
      }),
    ).not.toContain(secret);
    expect(MIGRATION_SKIP_MESSAGE).not.toContain("postgres://");
  });
});

describe("migration runner", () => {
  it("skips when no database URL is configured and does not connect", async () => {
    let connected = false;
    const connector: MigrationConnector = {
      connect: async () => {
        connected = true;
        throw new Error("connect should not be called");
      },
    };
    const result = await runMigrationsFromEnv({}, connector);
    expect(result).toEqual({
      status: "skipped",
      message: MIGRATION_SKIP_MESSAGE,
    });
    expect(connected).toBe(false);
  });

  it("connects with the session URL and never logs that URL", async () => {
    const session =
      "postgres://migrator:s3cret-token@db.example:5432/library?sslmode=require&supa=base-pooler.x";
    const pooled =
      "postgres://app:other-secret@aws-1-us-west-1.pooler.supabase.com:6543/postgres?supa=base-pooler.x";
    let seen: ClientConfig | undefined;
    const connector: MigrationConnector = {
      connect: async (config) => {
        seen = config;
        return {
          query: async (text, values) => {
            if (text.includes("WHERE name = $1")) {
              return { rows: [{ name: values?.[0] }] };
            }
            return { rows: [] };
          },
          end: async () => {},
        };
      },
    };
    const result = await runMigrationsFromEnv(
      { POSTGRES_URL_NON_POOLING: session, DATABASE_URL: pooled },
      connector,
    );
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.source).toBe("POSTGRES_URL_NON_POOLING");
    expect(result.applied).toEqual([]);
    expect(result.message).toContain("POSTGRES_URL_NON_POOLING");
    expect(result.message).not.toContain("s3cret-token");
    expect(result.message).not.toContain("other-secret");
    expect(result.message).not.toContain("base-pooler.x");
    expect(seen?.user).toBe("migrator");
    expect(seen?.password).toBe("s3cret-token");
    expect(seen).not.toHaveProperty("supa");
    expect(JSON.stringify(seen)).not.toContain("base-pooler.x");
    expect(JSON.stringify(result)).not.toContain("s3cret-token");
  });

  it("rolls back a failed migration and does not record it", async () => {
    const state = createMemoryState();
    await expect(
      applyMigrations(memoryClient(state), [
        { name: "001_ok.sql", sql: "CREATE TABLE ok (id int)" },
        { name: "002_bad.sql", sql: "SELECT 1/0" },
      ]),
    ).rejects.toThrow(/Migration 002_bad.sql failed/);
    expect(state.applied).toEqual(["001_ok.sql"]);
    expect(state.log).toContain("ROLLBACK");
    expect(state.log.filter((sql) => sql === "COMMIT")).toHaveLength(1);
    const failure = state.log.lastIndexOf("SELECT 1/0");
    expect(state.log.indexOf("ROLLBACK")).toBeGreaterThan(failure);
    expect(state.log.join("\n")).not.toContain("s3cret");
  });

  it("hides connection strings when a statement fails", async () => {
    const client: MigrationClient = {
      async query(text) {
        if (text.startsWith("SELECT 1/0")) {
          throw new Error(
            "server error postgres://user:s3cret@host/db?supa=base-pooler.x",
          );
        }
        return { rows: [] };
      },
    };
    await expect(
      applyMigrations(client, [{ name: "001_bad.sql", sql: "SELECT 1/0" }]),
    ).rejects.toThrow(/\[redacted-url\]/);
    await expect(
      applyMigrations(client, [{ name: "001_bad.sql", sql: "SELECT 1/0" }]),
    ).rejects.not.toThrow(/s3cret/);
  });

  it("applies the repository migrations once on Postgres", async () => {
    const pg = new PGlite();
    try {
      const client = pgliteClient(pg);
      const files = await readMigrationFiles();
      expect(files.map((file) => file.name)).toEqual([
        "0001_better_auth.sql",
        "0002_goodreads_storage.sql",
        "0003_abuse_controls.sql",
      ]);
      const first = await applyMigrations(client, files);
      expect(first.applied).toEqual(files.map((file) => file.name));
      expect(first.skipped).toEqual([]);
      const second = await applyMigrations(client, files);
      expect(second.applied).toEqual([]);
      expect(second.skipped).toEqual(files.map((file) => file.name));
      const tables = await pg.query<{
        books: string | null;
        migrations: string | null;
        abuse: string | null;
        users: string | null;
      }>(
        `SELECT to_regclass('public.goodreads_books') AS books,
                to_regclass('public.schema_migrations') AS migrations,
                to_regclass('public.abuse_rate_limits') AS abuse,
                to_regclass('public."user"') AS users`,
      );
      expect(tables.rows[0]?.books).toBe("goodreads_books");
      expect(tables.rows[0]?.migrations).toBe("schema_migrations");
      expect(tables.rows[0]?.abuse).toBe("abuse_rate_limits");
      expect(tables.rows[0]?.users).toContain("user");
    } finally {
      await pg.close();
    }
  });
});

function pgliteClient(pg: PGlite): MigrationClient {
  return {
    async query(text, values) {
      if (values !== undefined) {
        const result = await pg.query<Record<string, unknown>>(text, [
          ...values,
        ]);
        return { rows: result.rows };
      }
      const results = await pg.exec(text);
      const last = results[results.length - 1];
      return {
        rows: (last?.rows ?? []) as Record<string, unknown>[],
      };
    },
  };
}

function createMemoryState(): { applied: string[]; log: string[] } {
  return { applied: [], log: [] };
}

function memoryClient(state: {
  applied: string[];
  log: string[];
}): MigrationClient {
  let pending: string | undefined;
  return {
    async query(text, values) {
      state.log.push(text);
      if (
        text === "BEGIN" ||
        text === "COMMIT" ||
        text.startsWith("SELECT pg_advisory")
      ) {
        if (text === "COMMIT" && pending) {
          state.applied.push(pending);
          pending = undefined;
        }
        return { rows: [] };
      }
      if (text === "ROLLBACK") {
        pending = undefined;
        return { rows: [] };
      }
      if (text.includes("WHERE name = $1")) {
        const name = String(values?.[0]);
        return {
          rows: state.applied.includes(name) ? [{ name }] : [],
        };
      }
      if (text.startsWith("INSERT INTO schema_migrations")) {
        pending = String(values?.[0]);
        return { rows: [] };
      }
      if (text.includes("1/0")) throw new Error("division by zero");
      return { rows: [] };
    },
  };
}
