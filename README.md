# AI Workspace

An independent AI assistant and agent workspace. Built as a modular, free-tier-first project.

## Initial scope
- Chat UI and conversation history
- Cloudflare Worker API
- D1 persistence
- Pluggable AI model provider
- Tool/agent runtime added in staged milestones
- Explicit approval gates for consequential external actions

## Architecture
- `apps/web`: React + Vite frontend
- `workers/api`: Cloudflare Worker API
- `database/schema.sql`: D1 schema
- `docs/`: product, architecture, security, and roadmap

## Local development
Requirements: Node.js 20+ and npm.

```bash
npm install
# Terminal 1: frontend
npm run dev
# Terminal 2: API worker
npm run dev:api
```

The initial scaffold runs in demo mode until an AI provider secret is configured. Never put provider API keys in frontend environment variables. The API Worker runs separately on port 8787 during local development.

## Cloudflare
Configure a D1 database and set `AI_PROVIDER` and the selected provider's API key as Worker secrets. See `docs/ARCHITECTURE.md` and `docs/SECURITY.md`.

## Status
Phase 0: repository and initial scaffold.
Phase 1: provider integration, streaming, auth, and production hardening remain to be validated.
