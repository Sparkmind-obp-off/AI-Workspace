-- Current schema reference for a fresh database. Deploy using ordered migrations, not this snapshot.
PRAGMA foreign_keys = ON;

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Percakapan baru',
  mode TEXT NOT NULL DEFAULT 'chat' CHECK (mode IN ('chat', 'agent')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
, user_id TEXT NOT NULL DEFAULT 'legacy-unassigned', busy_until INTEGER NOT NULL DEFAULT 0);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
, status TEXT NOT NULL DEFAULT 'completed', provider TEXT NOT NULL DEFAULT 'unknown', reply_to TEXT REFERENCES messages(id) ON DELETE CASCADE);

CREATE TABLE agent_tasks (
  id TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'waiting_approval', 'completed', 'failed', 'cancelled')),
  input TEXT NOT NULL,
  plan_json TEXT,
  result_json TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
, user_id TEXT NOT NULL DEFAULT 'legacy-unassigned', provider TEXT NOT NULL DEFAULT 'demo');

CREATE TABLE tool_runs (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES agent_tasks(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'blocked')),
  input_json TEXT,
  output_json TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
, duration_ms INTEGER);

CREATE TABLE approvals (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  action_summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT
);

CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL, version TEXT NOT NULL);

CREATE TABLE user_settings (user_id TEXT PRIMARY KEY, provider TEXT NOT NULL DEFAULT 'demo');

CREATE TABLE rate_limits (key TEXT NOT NULL, bucket INTEGER NOT NULL, count INTEGER NOT NULL, expires_at INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(key,bucket));

CREATE TABLE agent_steps (id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE, position INTEGER NOT NULL CHECK(position BETWEEN 0 AND 2), tool_name TEXT NOT NULL, input_json TEXT NOT NULL, output_json TEXT, status TEXT NOT NULL CHECK(status IN ('pending','running','succeeded','failed')), UNIQUE(task_id,position));

CREATE INDEX idx_messages_conversation_created
  ON messages(conversation_id, created_at);

CREATE INDEX idx_conversation_owner ON conversations(user_id,updated_at);

CREATE INDEX idx_tasks_owner ON agent_tasks(user_id,created_at);

CREATE INDEX idx_sessions_expiry ON sessions(expires_at);

CREATE UNIQUE INDEX idx_message_reply ON messages(reply_to) WHERE reply_to IS NOT NULL;

CREATE INDEX idx_tool_task ON tool_runs(task_id,created_at);

CREATE INDEX idx_approval_task ON approvals(task_id,status);

CREATE INDEX idx_rate_expiry ON rate_limits(expires_at);
