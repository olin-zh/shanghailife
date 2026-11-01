-- 账本：每一笔钱从哪个账户到哪个账户。系统账户：gov 市政府、market 市场（所有 NPC）
CREATE TABLE accounts (id TEXT PRIMARY KEY, name TEXT NOT NULL, balance INTEGER NOT NULL DEFAULT 0);
INSERT INTO accounts (id, name, balance) VALUES ('gov', '市政府', 10000000), ('market', '市场', 0);
CREATE TABLE ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  src TEXT NOT NULL,
  dst TEXT NOT NULL,
  amount INTEGER NOT NULL,
  memo TEXT
);
CREATE INDEX ledger_src ON ledger(src, id);
CREATE INDEX ledger_dst ON ledger(dst, id);
