import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import type { ClientConfig } from "pg";
import { migrationClientConfig, sanitizeDbMessage } from "./postgres-config.js";

const { Client } = pg;

const MIGRATIONS_DIR = fileURLToPath(
  new URL("../../../migrations/", import.meta.url),
);

// Arbitrary constant. Session-scoped advisory locks do not survive Supavisor
// transaction mode, so the lock is held only until the migration transaction
// commits.
const MIGRATION_LOCK_SQL = "SELECT pg_advisory_xact_lock(8142026111201)";

const CREATE_MIGRATIONS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS schema_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
)`;

export const MIGRATION_SKIP_MESSAGE =
  "Skipping database migrations: neither POSTGRES_URL_NON_POOLING nor DATABASE_URL is set.";

export type MigrationSource = "POSTGRES_URL_NON_POOLING" | "DATABASE_URL";

export interface MigrationFile {
  name: string;
  sql: string;
}

export interface MigrationClient {
  query(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
}

export interface MigrationOutcome {
  applied: string[];
  skipped: string[];
}

export type MigrationRunResult =
  | { status: "skipped"; message: string }
  | {
      status: "ok";
      message: string;
      source: MigrationSource;
      applied: string[];
      skipped: string[];
    };

export interface MigrationConnector {
  connect(
    config: ClientConfig,
  ): Promise<MigrationClient & { end(): Promise<void> }>;
}

export function selectMigrationTarget(
  env: NodeJS.ProcessEnv,
): { source: MigrationSource; connectionString: string } | undefined {
  const session = env.POSTGRES_URL_NON_POOLING?.trim();
  if (session) {
    return {
      source: "POSTGRES_URL_NON_POOLING",
      connectionString: session,
    };
  }
  const databaseUrl = env.DATABASE_URL?.trim();
  if (databaseUrl) {
    return { source: "DATABASE_URL", connectionString: databaseUrl };
  }
  return undefined;
}

export function migrationResultMessage(
  source: MigrationSource,
  outcome: MigrationOutcome,
): string {
  if (outcome.applied.length === 0) {
    return `Database migrations already applied using ${source}.`;
  }
  const applied = outcome.applied.join(", ");
  if (outcome.skipped.length === 0) {
    return `Applied database migrations using ${source}: ${applied}.`;
  }
  return `Applied database migrations using ${source}: ${applied}. Already applied: ${outcome.skipped.join(", ")}.`;
}

export async function readMigrationFiles(
  directory = MIGRATIONS_DIR,
): Promise<MigrationFile[]> {
  const names = (await readdir(directory))
    .filter(
      (name) =>
        name.endsWith(".sql") && !name.includes("/") && !name.includes("\\"),
    )
    .sort();
  return Promise.all(
    names.map(async (name) => ({
      name,
      sql: await readFile(join(directory, name), "utf8"),
    })),
  );
}

export async function applyMigrations(
  client: MigrationClient,
  files: readonly MigrationFile[],
): Promise<MigrationOutcome> {
  const applied: string[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    await client.query("BEGIN");
    try {
      await client.query(MIGRATION_LOCK_SQL);
      await client.query(CREATE_MIGRATIONS_TABLE_SQL);
      const existing = await client.query(
        "SELECT name FROM schema_migrations WHERE name = $1",
        [file.name],
      );
      if (existing.rows.length > 0) {
        await client.query("COMMIT");
        skipped.push(file.name);
        continue;
      }
      // No parameter list: node-postgres uses the simple query protocol, which
      // can run every statement in the file inside the open transaction.
      await client.query(file.sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [
        file.name,
      ]);
      await client.query("COMMIT");
      applied.push(file.name);
    } catch (error) {
      await rollbackQuietly(client);
      throw new Error(
        `Migration ${file.name} failed: ${sanitizeDbMessage(error)}`,
        { cause: error },
      );
    }
  }
  return { applied, skipped };
}

export async function runMigrationsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  connector: MigrationConnector = pgConnector,
): Promise<MigrationRunResult> {
  const target = selectMigrationTarget(env);
  if (!target) return { status: "skipped", message: MIGRATION_SKIP_MESSAGE };

  const client = await connector.connect(
    migrationClientConfig(target.connectionString),
  );
  try {
    const files = await readMigrationFiles();
    const outcome = await applyMigrations(client, files);
    return {
      status: "ok",
      source: target.source,
      applied: outcome.applied,
      skipped: outcome.skipped,
      message: migrationResultMessage(target.source, outcome),
    };
  } finally {
    await client.end();
  }
}

const pgConnector: MigrationConnector = {
  async connect(config) {
    const client = new Client(config);
    // The client emits connection failures as events. Without a listener,
    // Node reports them as unhandled and can crash the build beside the
    // thrown error. The caller logs the thrown error once.
    client.on("error", () => {});
    try {
      await client.connect();
    } catch (error) {
      await client.end().catch(() => {});
      throw error;
    }
    return {
      query: async (text, values) => {
        const result =
          values === undefined
            ? await client.query(text)
            : await client.query(text, [...values]);
        return normalizeResult(result);
      },
      end: async () => {
        await client.end();
      },
    };
  },
};

function normalizeResult(result: unknown): { rows: Record<string, unknown>[] } {
  if (Array.isArray(result)) {
    const last: unknown = result[result.length - 1];
    return { rows: rowsOf(last) };
  }
  return { rows: rowsOf(result) };
}

function rowsOf(result: unknown): Record<string, unknown>[] {
  if (
    result &&
    typeof result === "object" &&
    "rows" in result &&
    Array.isArray(result.rows)
  ) {
    return result.rows as Record<string, unknown>[];
  }
  return [];
}

async function rollbackQuietly(client: MigrationClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // The server may already have aborted the transaction.
  }
}
