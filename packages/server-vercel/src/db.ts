import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import { sanitizeDbMessage, serverlessPoolConfig } from "./postgres-config.js";
import { postgresTextArrayPlugin } from "./postgres-text-arrays.js";
import type { Database } from "./repository.js";

const { Pool } = pg;

let pool: pg.Pool | undefined;
let database: Kysely<Record<string, never>> | undefined;

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is required. OAuth routes stay unavailable until DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, and GOODREADS_CREDENTIAL_KEY are set.",
      );
    }
    pool = new Pool(serverlessPoolConfig(connectionString));
    // An idle client error is emitted on the pool and would crash the isolate
    // if nobody listened. The next query opens a new connection.
    pool.on("error", (error: Error) => {
      console.error(
        `Postgres pool connection error: ${sanitizeDbMessage(error)}`,
      );
    });
  }
  return pool;
}

export function getDatabase(): Database {
  const active = getPool();
  return {
    query: (text, values) =>
      values === undefined ? active.query(text) : active.query(text, values),
    async transaction(fn) {
      const client = await active.connect();
      let destroy = false;
      try {
        await client.query("BEGIN");
        const result = await fn({
          query: (text, values) =>
            values === undefined
              ? client.query(text)
              : client.query(text, values),
        });
        await client.query("COMMIT");
        return result;
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          destroy = true;
        }
        throw error;
      } finally {
        client.release(destroy);
      }
    },
  };
}

export function getAuthDatabase(): Kysely<Record<string, never>> {
  if (!database) {
    // withPlugin widens Kysely's type parameter to unknown.
    const kysely = new Kysely<Record<string, never>>({
      dialect: new PostgresDialect({ pool: getPool() }),
    }).withPlugin(postgresTextArrayPlugin);
    database = kysely as Kysely<Record<string, never>>;
  }
  return database;
}
