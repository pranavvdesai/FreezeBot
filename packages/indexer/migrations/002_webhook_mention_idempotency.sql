CREATE TABLE IF NOT EXISTS webhook_mention_idempotency (
  mention_tweet_id TEXT PRIMARY KEY,
  processed_at TEXT NOT NULL
);
