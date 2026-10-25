import { Pool, neonConfig } from "@neondatabase/serverless";
import { Kysely, PostgresDialect } from "kysely";
import ws from "ws";

let pool: Pool | undefined;
let database: Kysely<Record<string, never>> | undefined;

neonConfig.webSocketConstructor = ws;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is required.");
    pool = new Pool({ connectionString, max: 5 });
  }
  return pool;
}

export function getAuthDatabase(): Kysely<Record<string, never>> {
  database ??= new Kysely({
    // Neon implements the node-postgres Pool contract at runtime. Its Client
    // connect overload is intentionally narrower, so Kysely needs this bridge.
    dialect: new PostgresDialect({ pool: getPool() as never }),
  });
  return database;
}
