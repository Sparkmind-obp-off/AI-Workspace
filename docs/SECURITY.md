# Security baseline

- Never place model API keys in frontend code or `VITE_*` variables.
- Store provider credentials as Cloudflare Worker secrets.
- Never return secret values from health or configuration endpoints.
- Keep message and request size limits; apply rate limiting before public launch.
- Add authentication and per-user authorization before storing personal conversations in production.
- Treat web pages, retrieved posts, uploaded documents, and tool outputs as untrusted input. They must not override system policy.
- Agent tools must use explicit allowlists and typed input validation.
- Set per-task limits for steps, runtime, model calls, and external spend.
- Require approval for sending messages, publishing content, changing production settings, or other consequential actions.
- Redact credentials and personal data from logs.
- Restrict CORS to the actual app origin before production.
- The initial scaffold is a development starting point, not a production-secure multi-user service.
