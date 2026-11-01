-- 前滩 12 块商业地：买地、盖店、挂招牌、雇玩家
CREATE TABLE estates (
  id INTEGER PRIMARY KEY,
  owner TEXT REFERENCES users(id) ON DELETE SET NULL,
  owner_name TEXT,
  bought_at INTEGER,
  kind TEXT,
  name TEXT,
  price INTEGER,
  wage INTEGER,
  openings INTEGER NOT NULL DEFAULT 0,
  till REAL NOT NULL DEFAULT 0,
  visits INTEGER NOT NULL DEFAULT 0,
  npc REAL NOT NULL DEFAULT 0,
  settled_at INTEGER,
  sign BLOB,
  sign_mime TEXT,
  sign_ver INTEGER NOT NULL DEFAULT 0,
  sign_hidden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX estates_owner ON estates(owner);
WITH RECURSIVE n(i) AS (SELECT 0 UNION ALL SELECT i + 1 FROM n WHERE i < 11) INSERT INTO estates (id) SELECT i FROM n;
-- 员工：每人同时只能在一家打工
CREATE TABLE estate_staff (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  estate_id INTEGER NOT NULL,
  hired_at INTEGER NOT NULL
);
CREATE INDEX estate_staff_estate ON estate_staff(estate_id);
CREATE TABLE estate_reports (
  estate_id INTEGER NOT NULL,
  version INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (estate_id, version, user_id)
);
