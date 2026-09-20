import type { StoredBook } from "./types.js";

export class LibraryRepository {
  constructor(private readonly db: D1Database) {}

  async saveUser(
    userId: string,
    goodreadsUserId: string,
    profileUrl: string,
    rssKey?: string,
  ) {
    await this.db
      .prepare(
        `INSERT INTO users (id, goodreads_user_id, profile_url, rss_key)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET goodreads_user_id=excluded.goodreads_user_id,
          profile_url=excluded.profile_url, rss_key=excluded.rss_key, updated_at=CURRENT_TIMESTAMP`,
      )
      .bind(userId, goodreadsUserId, profileUrl, rssKey ?? null)
      .run();
  }

  async user(userId: string) {
    return this.db
      .prepare(
        `SELECT id, goodreads_user_id AS goodreadsUserId,
      profile_url AS profileUrl, rss_key AS rssKey FROM users WHERE id=?`,
      )
      .bind(userId)
      .first<{
        id: string;
        goodreadsUserId: string;
        profileUrl: string;
        rssKey: string | null;
      }>();
  }

  async importBooks(userId: string, books: StoredBook[]): Promise<number> {
    if (!books.length) return 0;
    const statements = books.map((book) =>
      this.db
        .prepare(
          `INSERT INTO books
        (user_id, goodreads_id, title, author, isbn, isbn13, shelf, rating,
         average_rating, date_read, date_added, review, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, goodreads_id, shelf, source) DO UPDATE SET
          title=excluded.title, author=excluded.author, isbn=excluded.isbn,
          isbn13=excluded.isbn13, rating=excluded.rating,
          average_rating=excluded.average_rating, date_read=excluded.date_read,
          date_added=excluded.date_added, review=excluded.review`,
        )
        .bind(
          userId,
          book.goodreadsId ?? null,
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
        ),
    );
    for (let i = 0; i < statements.length; i += 100) {
      await this.db.batch(statements.slice(i, i + 100));
    }
    return books.length;
  }

  async shelves(userId: string): Promise<string[]> {
    const result = await this.db
      .prepare(
        "SELECT DISTINCT shelf FROM books WHERE user_id=? ORDER BY shelf",
      )
      .bind(userId)
      .all<{ shelf: string }>();
    return result.results.map(({ shelf }) => shelf);
  }

  async list(userId: string, shelf: string, limit: number) {
    return (
      await this.db
        .prepare(
          `SELECT title, author, isbn, isbn13, shelf, rating,
      average_rating AS averageRating, date_read AS dateRead, date_added AS dateAdded
      FROM books WHERE user_id=? AND shelf=? ORDER BY COALESCE(date_read,date_added) DESC LIMIT ?`,
        )
        .bind(userId, shelf, limit)
        .all()
    ).results;
  }

  async search(userId: string, query: string, limit: number) {
    const pattern = `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    return (
      await this.db
        .prepare(
          `SELECT title, author, isbn, isbn13, shelf, rating, date_read AS dateRead
      FROM books WHERE user_id=? AND (title LIKE ? ESCAPE '\\' OR author LIKE ? ESCAPE '\\')
      ORDER BY title LIMIT ?`,
        )
        .bind(userId, pattern, pattern, limit)
        .all()
    ).results;
  }

  async book(userId: string, value: string) {
    return (
      (await this.db
        .prepare(
          `SELECT title, author, isbn, isbn13, shelf, rating,
      average_rating AS averageRating, date_read AS dateRead, review FROM books
      WHERE user_id=? AND (isbn=? OR isbn13=? OR title LIKE ?) LIMIT 1`,
        )
        .bind(userId, value, value, `%${value}%`)
        .first()) ?? null
    );
  }

  async stats(userId: string, year?: number) {
    const filter = year ? " AND substr(date_read,1,4)=?" : "";
    const values = year ? [userId, String(year)] : [userId];
    return this.db
      .prepare(
        `SELECT COUNT(*) AS booksRead,
      ROUND(AVG(NULLIF(rating,0)),2) AS averageRating,
      MIN(date_read) AS firstFinished, MAX(date_read) AS lastFinished
      FROM books WHERE user_id=? AND shelf='read'${filter}`,
      )
      .bind(...values)
      .first();
  }

  async readingBrief(userId: string, year?: number) {
    const filter = year ? " AND substr(date_read,1,4)=?" : "";
    const values = year ? [userId, String(year)] : [userId];
    const [stats, authors, favorites, recent] = await Promise.all([
      this.stats(userId, year),
      this.db
        .prepare(
          `SELECT author, COUNT(*) AS count FROM books
          WHERE user_id=? AND shelf='read'${filter}
          GROUP BY author ORDER BY count DESC, author ASC LIMIT 3`,
        )
        .bind(...values)
        .all<{ author: string; count: number }>(),
      this.db
        .prepare(
          `SELECT title, author, rating, date_read AS dateRead FROM books
          WHERE user_id=? AND shelf='read' AND rating > 0${filter}
          ORDER BY rating DESC, date_read DESC LIMIT 3`,
        )
        .bind(...values)
        .all<{
          title: string;
          author: string;
          rating: number;
          dateRead: string | null;
        }>(),
      this.db
        .prepare(
          `SELECT title, author, rating, date_read AS dateRead FROM books
          WHERE user_id=? AND shelf='read'${filter}
          ORDER BY date_read DESC LIMIT 3`,
        )
        .bind(...values)
        .all<{
          title: string;
          author: string;
          rating: number | null;
          dateRead: string | null;
        }>(),
    ]);
    const label = year ?? "Reading";
    const topAuthor = authors.results[0];
    const favoriteLines = favorites.results.length
      ? favorites.results
          .map(
            (book) => `- *${book.title}* by ${book.author} — ${book.rating}/5`,
          )
          .join("\n")
      : "- Add Goodreads ratings to surface your favorites here.";
    const recentLines = recent.results.length
      ? recent.results
          .map((book) => `- *${book.title}* by ${book.author}`)
          .join("\n")
      : "- No finished books yet.";
    const booksRead = Number(stats?.booksRead ?? 0);
    const averageRating = Number(stats?.averageRating ?? 0);

    return {
      title: `${label} Reading Brief`,
      year: year ?? null,
      stats: {
        booksRead,
        averageRating: averageRating || null,
      },
      topAuthors: authors.results,
      favoriteBooks: favorites.results,
      recentBooks: recent.results,
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

  async deleteUser(userId: string) {
    await this.db.prepare("DELETE FROM users WHERE id=?").bind(userId).run();
  }
}
