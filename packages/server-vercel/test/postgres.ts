import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import type { Database } from "../src/repository.js";

export async function createTestDatabase(): Promise<{
  pg: PGlite;
  db: Database;
}> {
  const pg = new PGlite();
  for (const name of [
    "0001_better_auth.sql",
    "0002_goodreads_storage.sql",
    "0003_abuse_controls.sql",
  ]) {
    const migration = await readFile(
      fileURLToPath(new URL(`../../../migrations/${name}`, import.meta.url)),
      "utf8",
    );
    await pg.exec(migration);
  }
  const db: Database = {
    query: (text, values) => pg.query(text, values),
    transaction: (fn) =>
      pg.transaction((tx) =>
        fn({
          query: (text, values) => tx.query(text, values),
        }),
      ),
  };
  return { pg, db };
}
