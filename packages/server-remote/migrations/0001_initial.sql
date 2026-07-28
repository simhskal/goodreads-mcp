PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  goodreads_user_id TEXT NOT NULL,
  profile_url TEXT NOT NULL,
  rss_key TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goodreads_id TEXT,
  title TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  isbn TEXT,
  isbn13 TEXT,
  shelf TEXT NOT NULL DEFAULT 'read',
  rating REAL,
  average_rating REAL,
  date_read TEXT,
  date_added TEXT,
  review TEXT,
  source TEXT NOT NULL CHECK(source IN ('csv', 'rss')),
  UNIQUE(user_id, goodreads_id, shelf, source)
);

CREATE INDEX books_user_shelf ON books(user_id, shelf);
CREATE INDEX books_user_title ON books(user_id, title);
CREATE INDEX books_user_isbn ON books(user_id, isbn);
CREATE INDEX books_user_isbn13 ON books(user_id, isbn13);
