-- 玩家开的店：10 个铺面
CREATE TABLE shops (
  id INTEGER PRIMARY KEY,
  owner TEXT REFERENCES users(id) ON DELETE SET NULL,
  owner_name TEXT,
  kind TEXT,
  name TEXT,
  price INTEGER,
  till REAL NOT NULL DEFAULT 0,
  sold INTEGER NOT NULL DEFAULT 0,
  npc REAL NOT NULL DEFAULT 0,
  settled_at INTEGER,
  opened_at INTEGER
);
CREATE UNIQUE INDEX shops_owner ON shops(owner) WHERE owner IS NOT NULL;
WITH RECURSIVE n(i) AS (SELECT 0 UNION ALL SELECT i + 1 FROM n WHERE i < 9) INSERT INTO shops (id) SELECT i FROM n;
