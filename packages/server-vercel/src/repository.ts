import type { QueryResultRow } from "pg";
import type { GoodreadsProfile, StoredBook } from "./types.js";

export interface Database {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Row[] }>;
  transaction?<T>(fn: (db: Database) => Promise<T>): Promise<T>;
}

const BOOK_COLUMNS = 13;
const BOOK_IMPORT_BATCH = 100;
const MAX_IMPORT_BOOKS = 50_000;

export function goodreadsBookInsertSql(rowCount: number): string {
  if (
    !Number.isInteger(rowCount) ||
    rowCount < 1 ||
    rowCount > BOOK_IMPORT_BATCH
  ) {
    throw new Error("Book import batch must contain between 1 and 100 rows.");
  }
  const tuples = Array.from({ length: rowCount }, (_, row) => {
    const values = Array.from(
      { length: BOOK_COLUMNS },
      (_, column) => `$${row * BOOK_COLUMNS + column + 1}`,
    );
    return `(${values.join(",")})`;
  });
  return `INSERT INTO goodreads_books
      (auth_user_id, goodreads_id, title, author, isbn, isbn13, shelf,
       rating, average_rating, date_read, date_added, review, source)
     VALUES ${tuples.join(",")}
     ON CONFLICT (auth_user_id, goodreads_id, shelf, source) DO UPDATE SET
       title = EXCLUDED.title, author = EXCLUDED.author,
       isbn = EXCLUDED.isbn, isbn13 = EXCLUDED.isbn13,
       rating = EXCLUDED.rating, average_rating = EXCLUDED.average_rating,
       date_read = EXCLUDED.date_read, date_added = EXCLUDED.date_added,
       review = EXCLUDED.review`;
}

export class LibraryRepository {
  constructor(private readonly db: Database) {}

  async saveProfile(
    authUserId: string,
    goodreadsUserId: string,
    profileUrl: string,
    encryptedRssKey?: string,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO goodreads_profiles
        (auth_user_id, goodreads_user_id, profile_url, encrypted_rss_key)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (auth_user_id) DO UPDATE SET
         goodreads_user_id = EXCLUDED.goodreads_user_id,
         profile_url = EXCLUDED.profile_url,
         encrypted_rss_key = EXCLUDED.encrypted_rss_key,
         updated_at = NOW()`,
      [authUserId, goodreadsUserId, profileUrl, encryptedRssKey ?? null],
    );
  }

  async profile(authUserId: string): Promise<GoodreadsProfile | null> {
    const result = await this.db.query<GoodreadsProfile>(
      `SELECT auth_user_id AS "authUserId",
        goodreads_user_id AS "goodreadsUserId",
        profile_url AS "profileUrl",
        encrypted_rss_key AS "encryptedRssKey"
       FROM goodreads_profiles WHERE auth_user_id = $1`,
      [authUserId],
    );
    return result.rows[0] ?? null;
  }

  async importBooks(authUserId: string, books: StoredBook[]): Promise<number> {
    if (books.length > MAX_IMPORT_BOOKS) {
      throw new Error("Too many books to import.");
    }
    const unique = dedupeBooks(books);
    for (let offset = 0; offset < unique.length; offset += BOOK_IMPORT_BATCH) {
      const batch = unique.slice(offset, offset + BOOK_IMPORT_BATCH);
      await this.db.query(
        goodreadsBookInsertSql(batch.length),
        batch.flatMap((book) => bookValues(authUserId, book)),
      );
    }
    return books.length;
  }

  async shelves(authUserId: string): Promise<string[]> {
    const result = await this.db.query<{ shelf: string }>(
      "SELECT DISTINCT shelf FROM goodreads_books WHERE auth_user_id = $1 ORDER BY shelf",
      [authUserId],
    );
    return result.rows.map(({ shelf }) => shelf);
  }

  async list(authUserId: string, shelf: string, limit: number) {
    const result = await this.db.query(
      `SELECT title, author, isbn, isbn13, shelf, rating,
        average_rating AS "averageRating", date_read AS "dateRead",
        date_added AS "dateAdded"
       FROM goodreads_books WHERE auth_user_id = $1 AND shelf = $2
       ORDER BY COALESCE(date_read, date_added) DESC NULLS LAST LIMIT $3`,
      [authUserId, shelf, limit],
    );
    return result.rows;
  }

  async search(authUserId: string, query: string, limit: number) {
    const result = await this.db.query(
      `SELECT title, author, isbn, isbn13, shelf, rating,
        date_read AS "dateRead"
       FROM goodreads_books
       WHERE auth_user_id = $1 AND (title ILIKE $2 OR author ILIKE $2)
       ORDER BY title LIMIT $3`,
      [authUserId, `%${escapeLike(query)}%`, limit],
    );
    return result.rows;
  }

  async book(authUserId: string, value: string) {
    const result = await this.db.query(
      `SELECT title, author, isbn, isbn13, shelf, rating,
        average_rating AS "averageRating", date_read AS "dateRead", review
       FROM goodreads_books
       WHERE auth_user_id = $1 AND (isbn = $2 OR isbn13 = $2 OR title ILIKE $3)
       ORDER BY CASE WHEN isbn = $2 OR isbn13 = $2 THEN 0 ELSE 1 END LIMIT 1`,
      [authUserId, value, `%${escapeLike(value)}%`],
    );
    return result.rows[0] ?? null;
  }

  async stats(authUserId: string, year?: number) {
    const values: unknown[] = [authUserId];
    const yearFilter = year
      ? ` AND EXTRACT(YEAR FROM NULLIF(date_read, '')::date) = $${values.push(year)}`
      : "";
    const result = await this.db.query(
      `SELECT COUNT(*)::int AS "booksRead",
        ROUND(AVG(NULLIF(rating, 0))::numeric, 2)::float AS "averageRating",
        MIN(date_read) AS "firstFinished", MAX(date_read) AS "lastFinished"
       FROM goodreads_books
       WHERE auth_user_id = $1 AND shelf = 'read'${yearFilter}`,
      values,
    );
    return result.rows[0] ?? null;
  }

  async readingBrief(authUserId: string, year?: number) {
    const values: unknown[] = [authUserId];
    const yearFilter = year
      ? ` AND EXTRACT(YEAR FROM NULLIF(date_read, '')::date) = $${values.push(year)}`
      : "";
    const [stats, authors, favorites, recent] = await Promise.all([
      this.stats(authUserId, year),
      this.db.query<{ author: string; count: number }>(
        `SELECT author, COUNT(*)::int AS count FROM goodreads_books
         WHERE auth_user_id = $1 AND shelf = 'read'${yearFilter}
         GROUP BY author ORDER BY count DESC, author ASC LIMIT 3`,
        values,
      ),
      this.db.query<{
        title: string;
        author: string;
        rating: number;
        dateRead: string | null;
      }>(
        `SELECT title, author, rating, date_read AS "dateRead" FROM goodreads_books
         WHERE auth_user_id = $1 AND shelf = 'read' AND rating > 0${yearFilter}
         ORDER BY rating DESC, date_read DESC NULLS LAST LIMIT 3`,
        values,
      ),
      this.db.query<{
        title: string;
        author: string;
        rating: number | null;
        dateRead: string | null;
      }>(
        `SELECT title, author, rating, date_read AS "dateRead" FROM goodreads_books
         WHERE auth_user_id = $1 AND shelf = 'read'${yearFilter}
         ORDER BY date_read DESC NULLS LAST LIMIT 3`,
        values,
      ),
    ]);
    const label = year ?? "Reading";
    const booksRead = Number(stats?.booksRead ?? 0);
    const averageRating = Number(stats?.averageRating ?? 0);
    const topAuthor = authors.rows[0];
    const favoriteLines = favorites.rows.length
      ? favorites.rows
          .map(
            (book) => `- *${book.title}* by ${book.author} — ${book.rating}/5`,
          )
          .join("\n")
      : "- Add Goodreads ratings to surface your favorites here.";
    const recentLines = recent.rows.length
      ? recent.rows
          .map((book) => `- *${book.title}* by ${book.author}`)
          .join("\n")
      : "- No finished books yet.";
    return {
      title: `${label} Reading Brief`,
      year: year ?? null,
      stats: { booksRead, averageRating: averageRating || null },
      topAuthors: authors.rows,
      favoriteBooks: favorites.rows,
      recentBooks: recent.rows,
      markdown: [
        `# ${label} Reading Brief`,
        "",
        `I finished ${booksRead} book${booksRead === 1 ? "" : "s"}.`,
        averageRating
          ? `My average rating was ${averageRating.toFixed(1)}/5.`
          : "I have not rated any finished books yet.",
        topAuthor
          ? `The author I returned to most was ${topAuthor.author} (${topAuthor.count} books).`
          : "",
        "",
        "## Favorites",
        favoriteLines,
        "",
        "## Most recent",
        recentLines,
      ]
        .filter(Boolean)
        .join("\n"),
    };
  }

  async cachedShelf(cacheKey: string): Promise<StoredBook[] | null> {
    const result = await this.db.query<{ payload: StoredBook[] }>(
      "SELECT payload FROM goodreads_rss_cache WHERE cache_key = $1 AND expires_at > NOW()",
      [cacheKey],
    );
    return result.rows[0]?.payload ?? null;
  }

  async cacheShelf(cacheKey: string, books: StoredBook[]): Promise<void> {
    await this.db.query(
      `INSERT INTO goodreads_rss_cache (cache_key, payload, expires_at)
       VALUES ($1, $2::jsonb, NOW() + INTERVAL '15 minutes')
       ON CONFLICT (cache_key) DO UPDATE SET
         payload = EXCLUDED.payload, expires_at = EXCLUDED.expires_at`,
      [cacheKey, JSON.stringify(books)],
    );
  }

  async deleteUser(authUserId: string): Promise<void> {
    await this.transaction(async (db) => {
      await deleteAuthGraph(db, [authUserId]);
      await db.query("DELETE FROM goodreads_profiles WHERE auth_user_id = $1", [
        authUserId,
      ]);
      await db.query(
        "DELETE FROM goodreads_rss_cache WHERE cache_key LIKE $1",
        [`rss:${escapeLike(authUserId)}:%`],
      );
      await db.query(`DELETE FROM "user" WHERE id = $1`, [authUserId]);
    });
  }

  async purgeUnusedAnonymousUsers(cutoff: Date): Promise<number> {
    return this.transaction(async (db) => {
      const doomed = await db.query<{ id: string }>(
        `SELECT u.id FROM "user" u
         WHERE u."isAnonymous" IS TRUE
           AND u."createdAt" < $1
           AND NOT EXISTS (
             SELECT 1 FROM goodreads_profiles p WHERE p.auth_user_id = u.id
           )`,
        [cutoff],
      );
      const ids = doomed.rows.map((row) => row.id);
      if (!ids.length) return 0;
      await deleteAuthGraph(db, ids);
      await db.query(
        `DELETE FROM goodreads_rss_cache WHERE cache_key LIKE ANY($1::text[])`,
        [ids.map((id) => `rss:${escapeLike(id)}:%`)],
      );
      const deleted = await db.query(
        `DELETE FROM "user" WHERE id = ANY($1::text[]) RETURNING id`,
        [ids],
      );
      return deleted.rows.length;
    });
  }

  async purgeUnusedOauthClients(cutoff: Date): Promise<number> {
    const deleted = await this.db.query(
      `DELETE FROM "oauthClient" AS client
       WHERE client."userId" IS NULL
         AND (client."createdAt" IS NULL OR client."createdAt" < $1)
         AND NOT EXISTS (
           SELECT 1 FROM "oauthAccessToken" AS token
           WHERE token."clientId" = client."clientId"
         )
         AND NOT EXISTS (
           SELECT 1 FROM "oauthRefreshToken" AS token
           WHERE token."clientId" = client."clientId"
         )
         AND NOT EXISTS (
           SELECT 1 FROM "oauthConsent" AS consent
           WHERE consent."clientId" = client."clientId"
         )
       RETURNING client.id`,
      [cutoff],
    );
    return deleted.rows.length;
  }

  async purgeExpiredRateLimits(cutoff: Date): Promise<number> {
    const deleted = await this.db.query(
      "DELETE FROM abuse_rate_limits WHERE reset_at < $1 RETURNING bucket",
      [cutoff],
    );
    return deleted.rows.length;
  }

  private async transaction<T>(fn: (db: Database) => Promise<T>): Promise<T> {
    if (!this.db.transaction) return fn(this.db);
    return this.db.transaction(fn);
  }
}

async function deleteAuthGraph(db: Database, ids: string[]): Promise<void> {
  await db.query(
    `DELETE FROM "oauthAccessToken"
     WHERE "userId" = ANY($1::text[])
        OR "referenceId" = ANY($1::text[])
        OR "sessionId" IN (
          SELECT id FROM "session" WHERE "userId" = ANY($1::text[])
        )
        OR "refreshId" IN (
          SELECT id FROM "oauthRefreshToken"
          WHERE "userId" = ANY($1::text[])
             OR "referenceId" = ANY($1::text[])
             OR "sessionId" IN (
               SELECT id FROM "session" WHERE "userId" = ANY($1::text[])
             )
        )`,
    [ids],
  );
  await db.query(
    `DELETE FROM "oauthRefreshToken"
     WHERE "userId" = ANY($1::text[])
        OR "referenceId" = ANY($1::text[])
        OR "sessionId" IN (
          SELECT id FROM "session" WHERE "userId" = ANY($1::text[])
        )`,
    [ids],
  );
  await db.query(
    `DELETE FROM "oauthConsent"
     WHERE "userId" = ANY($1::text[]) OR "referenceId" = ANY($1::text[])`,
    [ids],
  );
  await db.query(
    `UPDATE "oauthClient" SET "userId" = NULL WHERE "userId" = ANY($1::text[])`,
    [ids],
  );
  await db.query(`DELETE FROM "session" WHERE "userId" = ANY($1::text[])`, [
    ids,
  ]);
  await db.query(`DELETE FROM "account" WHERE "userId" = ANY($1::text[])`, [
    ids,
  ]);
}

function bookValues(authUserId: string, book: StoredBook): unknown[] {
  return [
    authUserId,
    book.goodreadsId ?? "",
    book.title,
    book.author,
    book.isbn ?? null,
    book.isbn13 ?? null,
    book.shelf,
    book.rating ?? null,
    book.averageRating ?? null,
    book.dateRead ?? null,
    book.dateAdded ?? null,
    book.review ?? null,
    book.source,
  ];
}

function dedupeBooks(books: StoredBook[]): StoredBook[] {
  const byKey = new Map<string, StoredBook>();
  for (const book of books) {
    byKey.set(`${book.goodreadsId ?? ""}\0${book.shelf}\0${book.source}`, book);
  }
  return [...byKey.values()];
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
