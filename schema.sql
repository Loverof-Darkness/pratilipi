CREATE TABLE IF NOT EXISTS drops (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  expiry_option TEXT NOT NULL DEFAULT '1d',
  label TEXT
);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  drop_id TEXT NOT NULL REFERENCES drops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  public_id TEXT NOT NULL UNIQUE,
  resource_type TEXT NOT NULL DEFAULT 'raw',
  secure_url TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size INTEGER NOT NULL DEFAULT 0,
  format TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS texts (
  id TEXT PRIMARY KEY,
  drop_id TEXT NOT NULL REFERENCES drops(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_files_drop_id ON files(drop_id);
CREATE INDEX IF NOT EXISTS idx_texts_drop_id ON texts(drop_id);
CREATE INDEX IF NOT EXISTS idx_drops_expires_at ON drops(expires_at);
