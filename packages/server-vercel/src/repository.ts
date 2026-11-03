import type { QueryResultRow } from "@neondatabase/serverless";
import type { GoodreadsProfile, StoredBook } from "./types.js";

export interface Database {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Row[] }>;
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
    for (const book of books) {
      await this.db.query(
        `INSERT INTO goodreads_books
          (auth_user_id, goodreads_id, title, author, isbn, isbn13, shelf,
           rating, average_rating, date_read, date_added, review, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (auth_user_id, goodreads_id, shelf, source) DO UPDATE SET
           title = EXCLUDED.title, author = EXCLUDED.author,
           isbn = EXCLUDED.isbn, isbn13 = EXCLUDED.isbn13,
           rating = EXCLUDED.rating, average_rating = EXCLUDED.average_rating,
           date_read = EXCLUDED.date_read, date_added = EXCLUDED.date_added,
           review = EXCLUDED.review`,
        [
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
        ],
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
    await this.db.query(
      "DELETE FROM goodreads_profiles WHERE auth_user_id = $1",
      [authUserId],
    );
    await this.db.query(
      "DELETE FROM goodreads_rss_cache WHERE cache_key LIKE $1",
      [`rss:${escapeLike(authUserId)}:%`],
    );
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
