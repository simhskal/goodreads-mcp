import { Pool, neonConfig } from "@neondatabase/serverless";
import { Kysely, PostgresDialect } from "kysely";
import ws from "ws";
import type { Database } from "./repository.js";

let pool: Pool | undefined;
let database: Kysely<Record<string, never>> | undefined;

neonConfig.webSocketConstructor = ws;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is required. OAuth routes stay unavailable until DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, and GOODREADS_CREDENTIAL_KEY are set.",
      );
    }
    pool = new Pool({ connectionString, max: 5 });
  }
  return pool;
}

export function getDatabase(): Database {
  const pool = getPool();
  return {
    query: (text, values) => pool.query(text, values),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn({
          query: (text, values) => client.query(text, values),
        });
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

export function getAuthDatabase(): Kysely<Record<string, never>> {
  database ??= new Kysely({
    // Neon implements the node-postgres Pool contract at runtime. Its Client
    // connect overload is intentionally narrower, so Kysely needs this bridge.
    dialect: new PostgresDialect({ pool: getPool() as never }),
  });
  return database;
}
