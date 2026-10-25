CREATE TABLE IF NOT EXISTS goodreads_profiles (
  auth_user_id TEXT PRIMARY KEY,
  goodreads_user_id TEXT NOT NULL,
  profile_url TEXT NOT NULL,
  encrypted_rss_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS goodreads_books (
  id BIGSERIAL PRIMARY KEY,
  auth_user_id TEXT NOT NULL REFERENCES goodreads_profiles(auth_user_id) ON DELETE CASCADE,
  goodreads_id TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  isbn TEXT,
  isbn13 TEXT,
  shelf TEXT NOT NULL DEFAULT 'read',
  rating DOUBLE PRECISION,
  average_rating DOUBLE PRECISION,
  date_read TEXT,
  date_added TEXT,
  review TEXT,
  source TEXT NOT NULL CHECK (source IN ('csv', 'rss')),
  UNIQUE (auth_user_id, goodreads_id, shelf, source)
);

CREATE INDEX IF NOT EXISTS goodreads_books_user_shelf ON goodreads_books(auth_user_id, shelf);
CREATE INDEX IF NOT EXISTS goodreads_books_user_title ON goodreads_books(auth_user_id, title);
CREATE INDEX IF NOT EXISTS goodreads_books_user_isbn ON goodreads_books(auth_user_id, isbn);
CREATE INDEX IF NOT EXISTS goodreads_books_user_isbn13 ON goodreads_books(auth_user_id, isbn13);

CREATE TABLE IF NOT EXISTS goodreads_rss_cache (
  cache_key TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS goodreads_rss_cache_expiry ON goodreads_rss_cache(expires_at);
