ALTER TABLE rate_limits ADD COLUMN expires_at INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_rate_expiry ON rate_limits(expires_at);
