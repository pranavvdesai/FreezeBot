CREATE TABLE IF NOT EXISTS tweet_archives (
  tweet_id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  cid TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  mention_tweet_id TEXT,
  mode TEXT,
  archive_metadata TEXT
);

CREATE INDEX IF NOT EXISTS tweet_archives_conversation_id_idx
ON tweet_archives (conversation_id);

CREATE INDEX IF NOT EXISTS tweet_archives_status_idx
ON tweet_archives (status);
