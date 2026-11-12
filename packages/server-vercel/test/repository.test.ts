import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import {
  goodreadsBookInsertSql,
  LibraryRepository,
  type Database,
} from "../src/repository.js";

let pool: PGlite;
let repository: LibraryRepository;

beforeEach(async () => {
  pool = new PGlite();
  for (const name of ["0001_better_auth.sql", "0002_goodreads_storage.sql"]) {
    const migration = await readFile(
      fileURLToPath(new URL(`../../../migrations/${name}`, import.meta.url)),
      "utf8",
    );
    await pool.exec(migration);
  }
  repository = new LibraryRepository(pool as unknown as Database);
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
});
