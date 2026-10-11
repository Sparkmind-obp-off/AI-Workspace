-- Preserve old unowned records without granting them to the new owner.
ALTER TABLE conversations ADD COLUMN user_id TEXT NOT NULL DEFAULT 'legacy-unassigned';
ALTER TABLE conversations ADD COLUMN busy_until INTEGER NOT NULL DEFAULT 0;
ALTER TABLE messages ADD COLUMN status TEXT NOT NULL DEFAULT 'completed';
ALTER TABLE messages ADD COLUMN provider TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE messages ADD COLUMN reply_to TEXT REFERENCES messages(id) ON DELETE CASCADE;
ALTER TABLE agent_tasks ADD COLUMN user_id TEXT NOT NULL DEFAULT 'legacy-unassigned';
ALTER TABLE agent_tasks ADD COLUMN provider TEXT NOT NULL DEFAULT 'demo';
ALTER TABLE tool_runs ADD COLUMN duration_ms INTEGER;
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL, version TEXT NOT NULL);
CREATE TABLE user_settings (user_id TEXT PRIMARY KEY, provider TEXT NOT NULL DEFAULT 'demo');
CREATE TABLE rate_limits (key TEXT NOT NULL, bucket INTEGER NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(key,bucket));
CREATE TABLE agent_steps (id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE, position INTEGER NOT NULL CHECK(position BETWEEN 0 AND 2), tool_name TEXT NOT NULL, input_json TEXT NOT NULL, output_json TEXT, status TEXT NOT NULL CHECK(status IN ('pending','running','succeeded','failed')), UNIQUE(task_id,position));
CREATE INDEX idx_conversation_owner ON conversations(user_id,updated_at);
CREATE INDEX idx_tasks_owner ON agent_tasks(user_id,created_at);
CREATE INDEX idx_sessions_expiry ON sessions(expires_at);
CREATE UNIQUE INDEX idx_message_reply ON messages(reply_to) WHERE reply_to IS NOT NULL;
CREATE INDEX idx_tool_task ON tool_runs(task_id,created_at);
CREATE INDEX idx_approval_task ON approvals(task_id,status);
