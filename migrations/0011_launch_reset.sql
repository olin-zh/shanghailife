-- 正式上线：清空测试期间的所有数据（只执行一次）。需要找回可用 D1 Time Travel 恢复到上线前。
DELETE FROM sessions;
DELETE FROM saves;
DELETE FROM plots;
DELETE FROM estate_staff;
DELETE FROM estate_reports;
DELETE FROM estates;
DELETE FROM boat_reports;
DELETE FROM boat_orders;
UPDATE boats SET owner = NULL, owner_name = NULL, image = NULL, mime = NULL, mosaic = NULL, caption = NULL, version = 0, expires_at = NULL, hidden = 0, flagged = 0, reviewed_ver = 0, hold_by = NULL, hold_until = NULL, updated_at = NULL;
UPDATE shops SET owner = NULL, owner_name = NULL, kind = NULL, name = NULL, price = NULL, till = 0, sold = 0, npc = 0, settled_at = NULL, opened_at = NULL;
DELETE FROM ledger;
UPDATE accounts SET balance = CASE id WHEN 'gov' THEN 10000000 ELSE 0 END;
DELETE FROM users;
