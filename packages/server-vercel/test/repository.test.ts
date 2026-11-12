import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { purgeStaleAccounts } from "../src/purge.js";
import {
  goodreadsBookInsertSql,
  LibraryRepository,
  type Database,
} from "../src/repository.js";
import { createTestDatabase } from "./postgres.js";

let pool: PGlite;
let database: Database;
let repository: LibraryRepository;

beforeEach(async () => {
  const opened = await createTestDatabase();
  pool = opened.pg;
  database = opened.db;
  repository = new LibraryRepository(opened.db);
});

describe("book import SQL", () => {
  it("builds one batched upsert", () => {
    const sql = goodreadsBookInsertSql(2);
    expect(sql.match(/INSERT INTO goodreads_books/g)).toHaveLength(1);
    expect(sql).toContain("($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)");
    expect(sql).toContain(
      "($14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)",
    );
    expect(sql.match(/ON CONFLICT/g)).toHaveLength(1);
    expect(() => goodreadsBookInsertSql(101)).toThrow();
  });
});

describe("Postgres library repository", () => {
  it("stores profiles and upserts imported books", async () => {
    await repository.saveProfile(
      "auth-1",
      "42",
      "https://www.goodreads.com/user/show/42",
      "ciphertext",
    );
    await repository.importBooks("auth-1", [
      {
        goodreadsId: "7",
        title: "First title",
        author: "Ada",
        shelf: "read",
        rating: 4,
        source: "csv",
      },
    ]);
    await repository.importBooks("auth-1", [
      {
        goodreadsId: "7",
        title: "Updated title",
        author: "Ada",
        shelf: "read",
        rating: 5,
        source: "csv",
      },
    ]);

    await expect(repository.profile("auth-1")).resolves.toEqual({
      authUserId: "auth-1",
      goodreadsUserId: "42",
      profileUrl: "https://www.goodreads.com/user/show/42",
      encryptedRssKey: "ciphertext",
    });
    await expect(repository.list("auth-1", "read", 10)).resolves.toEqual([
      expect.objectContaining({ title: "Updated title", rating: 5 }),
    ]);
  });

  it("upserts duplicate books in one batch and continues across batches", async () => {
    await repository.saveProfile(
      "auth-1",
      "42",
      "https://www.goodreads.com/user/show/42",
    );
    const books = Array.from({ length: 101 }, (_, index) => ({
      goodreadsId: String(index === 100 ? 0 : index),
      title: `Title ${index}`,
      author: "Ada",
      shelf: "read",
      source: "csv" as const,
    }));
    await repository.importBooks("auth-1", books);
    const stored = await repository.list("auth-1", "read", 200);
    expect(stored).toHaveLength(100);
    expect(stored).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: "Title 100" })]),
    );
  });

  it("isolates accounts and cascades deletion", async () => {
    for (const id of ["auth-1", "auth-2"]) {
      await repository.saveProfile(
        id,
        id === "auth-1" ? "1" : "2",
        `https://www.goodreads.com/user/show/${id === "auth-1" ? "1" : "2"}`,
      );
      await repository.importBooks(id, [
        {
          goodreadsId: "7",
          title: id,
          author: "Author",
          shelf: "read",
          source: "csv",
        },
      ]);
      await repository.cacheShelf(`rss:${id}:42:read`, [
        {
          goodreadsId: "7",
          title: id,
          author: "Author",
          shelf: "read",
          source: "rss",
        },
      ]);
    }
    await repository.deleteUser("auth-1");
    await expect(repository.list("auth-1", "read", 10)).resolves.toEqual([]);
    await expect(repository.list("auth-2", "read", 10)).resolves.toHaveLength(
      1,
    );
    await expect(
      repository.cachedShelf("rss:auth-1:42:read"),
    ).resolves.toBeNull();
    await expect(
      repository.cachedShelf("rss:auth-2:42:read"),
    ).resolves.toHaveLength(1);
  });

  it("deletes the auth user, sessions, and oauth grants", async () => {
    await insertUser(pool, "auth-1", true, hoursAgo(1));
    await insertUser(pool, "auth-2", true, hoursAgo(1));
    await pool.exec(`
      INSERT INTO "session" (id, "expiresAt", token, "createdAt", "updatedAt", "userId")
      VALUES
        ('sess-1', NOW() + INTERVAL '1 day', 'session-token-1', NOW(), NOW(), 'auth-1'),
        ('sess-2', NOW() + INTERVAL '1 day', 'session-token-2', NOW(), NOW(), 'auth-2');
      INSERT INTO "account" (id, "accountId", "providerId", "userId", "createdAt", "updatedAt")
      VALUES ('acct-1', 'acct-1', 'anonymous', 'auth-1', NOW(), NOW());
      INSERT INTO "oauthClient"
        (id, "clientId", "redirectUris", "userId", "createdAt", "updatedAt")
      VALUES
        ('client-row-1', 'client-1', ARRAY['http://127.0.0.1/callback'], 'auth-1', NOW(), NOW()),
        ('client-row-2', 'client-2', ARRAY['http://127.0.0.1/other'], 'auth-2', NOW(), NOW());
      INSERT INTO "oauthRefreshToken"
        (id, token, "clientId", "sessionId", "userId", "expiresAt", "createdAt", scopes)
      VALUES
        ('rt-1', 'refresh-1', 'client-1', 'sess-1', 'auth-1', NOW() + INTERVAL '1 day', NOW(), ARRAY['library:read']),
        ('rt-2', 'refresh-2', 'client-1', 'sess-2', 'auth-2', NOW() + INTERVAL '1 day', NOW(), ARRAY['library:read']);
      INSERT INTO "oauthAccessToken"
        (id, token, "clientId", "sessionId", "userId", "refreshId", "referenceId", "expiresAt", "createdAt", scopes)
      VALUES
        ('at-1', 'access-1', 'client-1', 'sess-1', 'auth-1', 'rt-1', 'auth-1', NOW() + INTERVAL '1 hour', NOW(), ARRAY['library:read']),
        ('at-session', 'access-session', 'client-1', 'sess-1', NULL, NULL, NULL, NOW() + INTERVAL '1 hour', NOW(), ARRAY['library:read']),
        ('at-2', 'access-2', 'client-1', 'sess-2', 'auth-2', 'rt-2', 'auth-2', NOW() + INTERVAL '1 hour', NOW(), ARRAY['library:read']);
      INSERT INTO "oauthConsent"
        (id, "clientId", "userId", "referenceId", scopes, "createdAt", "updatedAt")
      VALUES
        ('consent-1', 'client-1', 'auth-1', 'auth-1', ARRAY['library:read'], NOW(), NOW());
    `);
    await repository.saveProfile(
      "auth-1",
      "42",
      "https://www.goodreads.com/user/show/42",
    );
    await repository.importBooks("auth-1", [
      {
        goodreadsId: "7",
        title: "Gone",
        author: "Ada",
        shelf: "read",
        source: "csv",
      },
    ]);
    await repository.cacheShelf("rss:auth-1:42:read", [
      {
        goodreadsId: "7",
        title: "Gone",
        author: "Ada",
        shelf: "read",
        source: "rss",
      },
    ]);

    await repository.deleteUser("auth-1");

    await expect(
      count(
        pool,
        `SELECT COUNT(*)::int AS count FROM "user" WHERE id = 'auth-1'`,
      ),
    ).resolves.toBe(0);
    await expect(
      count(
        pool,
        `SELECT COUNT(*)::int AS count FROM "session" WHERE "userId" = 'auth-1'`,
      ),
    ).resolves.toBe(0);
    await expect(
      count(
        pool,
        `SELECT COUNT(*)::int AS count FROM "account" WHERE "userId" = 'auth-1'`,
      ),
    ).resolves.toBe(0);
    await expect(
      count(
        pool,
        `SELECT COUNT(*)::int AS count FROM "oauthAccessToken" WHERE token IN ('access-1', 'access-session')`,
      ),
    ).resolves.toBe(0);
    await expect(
      count(
        pool,
        `SELECT COUNT(*)::int AS count FROM "oauthRefreshToken" WHERE token = 'refresh-1'`,
      ),
    ).resolves.toBe(0);
    await expect(
      count(
        pool,
        `SELECT COUNT(*)::int AS count FROM "oauthConsent" WHERE id = 'consent-1'`,
      ),
    ).resolves.toBe(0);
    await expect(repository.profile("auth-1")).resolves.toBeNull();
    await expect(repository.list("auth-1", "read", 10)).resolves.toEqual([]);
    await expect(
      repository.cachedShelf("rss:auth-1:42:read"),
    ).resolves.toBeNull();
    await expect(
      count(
        pool,
        `SELECT COUNT(*)::int AS count FROM "user" WHERE id = 'auth-2'`,
      ),
    ).resolves.toBe(1);
    await expect(
      count(
        pool,
        `SELECT COUNT(*)::int AS count FROM "oauthAccessToken" WHERE token = 'access-2'`,
      ),
    ).resolves.toBe(1);
    await expect(
      pool.query<{ userId: string | null }>(
        `SELECT "userId" FROM "oauthClient" WHERE "clientId" = 'client-1'`,
      ),
    ).resolves.toMatchObject({ rows: [{ userId: null }] });
    await expect(
      pool.query<{ userId: string }>(
        `SELECT "userId" FROM "oauthClient" WHERE "clientId" = 'client-2'`,
      ),
    ).resolves.toMatchObject({ rows: [{ userId: "auth-2" }] });
  });

  it("purges unused anonymous users, idle clients, and expired counters", async () => {
    const old = hoursAgo(24 * 30);
    const fresh = new Date();
    await insertUser(pool, "old-anon", true, old);
    await insertUser(pool, "kept-reader", true, old);
    await insertUser(pool, "fresh-anon", true, fresh);
    await insertUser(pool, "kept-named", false, old);
    await pool.exec(`
      INSERT INTO "session" (id, "expiresAt", token, "createdAt", "updatedAt", "userId")
      VALUES ('sess-old', NOW() + INTERVAL '1 day', 'old-session', NOW(), NOW(), 'old-anon');
      INSERT INTO "oauthClient"
        (id, "clientId", "redirectUris", "userId", "createdAt", "updatedAt")
      VALUES
        ('idle-client', 'idle', ARRAY['http://127.0.0.1/idle'], NULL, NOW() - INTERVAL '30 days', NOW()),
        ('used-client', 'used', ARRAY['http://127.0.0.1/used'], NULL, NOW() - INTERVAL '30 days', NOW()),
        ('fresh-client', 'fresh', ARRAY['http://127.0.0.1/fresh'], NULL, NOW(), NOW()),
        ('owned-client', 'owned', ARRAY['http://127.0.0.1/owned'], 'kept-named', NOW() - INTERVAL '30 days', NOW());
      INSERT INTO "oauthAccessToken"
        (id, token, "clientId", "userId", "expiresAt", "createdAt", scopes)
      VALUES
        ('used-token', 'used-access', 'used', 'kept-reader', NOW() + INTERVAL '1 hour', NOW(), ARRAY['library:read']);
    `);
    await repository.saveProfile(
      "kept-reader",
      "7",
      "https://www.goodreads.com/user/show/7",
    );
    await repository.importBooks("kept-reader", [
      {
        goodreadsId: "9",
        title: "Kept",
        author: "Ada",
        shelf: "read",
        source: "csv",
      },
    ]);
    await pool.query(
      `INSERT INTO abuse_rate_limits (bucket, hits, reset_at) VALUES
        ('expired', 4, $1),
        ('current', 2, $2)`,
      [hoursAgo(48), new Date(Date.now() + 60_000)],
    );

    const purged = await purgeStaleAccounts(database, fresh);

    expect(purged.anonymousUsers).toBe(1);
    expect(purged.oauthClients).toBe(1);
    expect(purged.rateLimitBuckets).toBe(1);
    await expect(
      count(
        pool,
        `SELECT COUNT(*)::int AS count FROM "user" WHERE id = 'old-anon'`,
      ),
    ).resolves.toBe(0);
    await expect(
      count(
        pool,
        `SELECT COUNT(*)::int AS count FROM "session" WHERE id = 'sess-old'`,
      ),
    ).resolves.toBe(0);
    await expect(
      count(
        pool,
        `SELECT COUNT(*)::int AS count FROM "user" WHERE id = 'kept-reader'`,
      ),
    ).resolves.toBe(1);
    await expect(
      count(
        pool,
        `SELECT COUNT(*)::int AS count FROM "user" WHERE id = 'fresh-anon'`,
      ),
    ).resolves.toBe(1);
    await expect(
      count(
        pool,
        `SELECT COUNT(*)::int AS count FROM "user" WHERE id = 'kept-named'`,
      ),
    ).resolves.toBe(1);
    await expect(
      repository.list("kept-reader", "read", 10),
    ).resolves.toHaveLength(1);
    await expect(
      count(
        pool,
        `SELECT COUNT(*)::int AS count FROM "oauthClient" WHERE "clientId" = 'idle'`,
      ),
    ).resolves.toBe(0);
    await expect(
      count(
        pool,
        `SELECT COUNT(*)::int AS count FROM "oauthClient" WHERE "clientId" IN ('used', 'fresh', 'owned')`,
      ),
    ).resolves.toBe(3);
    await expect(
      count(
        pool,
        `SELECT COUNT(*)::int AS count FROM abuse_rate_limits WHERE bucket = 'expired'`,
      ),
    ).resolves.toBe(0);
    await expect(
      count(
        pool,
        `SELECT COUNT(*)::int AS count FROM abuse_rate_limits WHERE bucket = 'current'`,
      ),
    ).resolves.toBe(1);
  });
});

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

async function insertUser(
  pg: PGlite,
  id: string,
  anonymous: boolean,
  createdAt: Date,
): Promise<void> {
  await pg.query(
    `INSERT INTO "user"
      (id, name, email, "emailVerified", "createdAt", "updatedAt", "isAnonymous")
     VALUES ($1, $2, $3, FALSE, $4, $4, $5)`,
    [id, id, `${id}@example.test`, createdAt, anonymous],
  );
}

async function count(pg: PGlite, sql: string): Promise<number> {
  const result = await pg.query<{ count: number }>(sql);
  return Number(result.rows[0]?.count ?? 0);
}
