-- Fixed-window counters for hosted abuse limits, plus a lookup index for the
-- anonymous-user purge. Credential buckets store a hash, never a token or RSS key.
CREATE TABLE IF NOT EXISTS abuse_rate_limits (
  bucket TEXT PRIMARY KEY,
  hits INTEGER NOT NULL,
  reset_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS abuse_rate_limits_reset_at ON abuse_rate_limits (reset_at);

CREATE INDEX IF NOT EXISTS user_anonymous_created_idx
  ON "user" ("createdAt")
  WHERE "isAnonymous" IS TRUE;
