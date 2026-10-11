-- LOCAL TEST DATABASE ONLY: reset test quotas, not production.
DELETE FROM rate_limits;
INSERT OR IGNORE INTO conversations (id,user_id,title) VALUES ('00000000-0000-4000-8000-000000000099','other-user','Foreign fixture');
INSERT OR IGNORE INTO agent_tasks (id,user_id,status,input) VALUES ('00000000-0000-4000-8000-000000000098','other-user','queued','Foreign task fixture');
