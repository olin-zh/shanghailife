-- 150 艘游船，每艘一块广告板。图片直接存 D1（客户端已压到 640×320 以内的 JPEG）。
CREATE TABLE boats (
  id INTEGER PRIMARY KEY,
  owner TEXT REFERENCES users(id) ON DELETE SET NULL,
  owner_name TEXT,
  image BLOB,
  mime TEXT,
  caption TEXT,
  version INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER,
  hidden INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER
);
CREATE INDEX boats_owner ON boats(owner);
WITH RECURSIVE n(i) AS (SELECT 0 UNION ALL SELECT i + 1 FROM n WHERE i < 149) INSERT INTO boats (id) SELECT i FROM n;
CREATE TABLE boat_reports (
  boat_id INTEGER NOT NULL,
  version INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (boat_id, version, user_id)
);
