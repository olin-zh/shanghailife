-- 游船广告改成真钱（Stripe）：订单表；被举报先打马赛克，等管理员审核
ALTER TABLE boats ADD COLUMN mosaic BLOB;
ALTER TABLE boats ADD COLUMN flagged INTEGER NOT NULL DEFAULT 0;
ALTER TABLE boats ADD COLUMN reviewed_ver INTEGER NOT NULL DEFAULT 0;
ALTER TABLE boats ADD COLUMN hold_by TEXT;
ALTER TABLE boats ADD COLUMN hold_until INTEGER;
CREATE TABLE boat_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT,
  boat_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  image BLOB,
  mosaic BLOB,
  mime TEXT,
  caption TEXT,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  session_id TEXT,
  payment_intent TEXT,
  created_at INTEGER NOT NULL,
  paid_at INTEGER
);
CREATE INDEX boat_orders_session ON boat_orders(session_id);
