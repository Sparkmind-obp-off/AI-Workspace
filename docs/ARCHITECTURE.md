# Architecture — implemented 2026-10-11

## Deployment shape
The existing React/Vite project and native Worker were retained rather than replaced. `npm run build` creates Vite assets plus a bundled Pages advanced-mode `dist/_worker.js`. The Worker handles `/api/*` and delegates other requests to `env.ASSETS.fetch`, giving the frontend and API one origin. The original standalone Worker config remains for split frontend/API development; it requires its own D1 binding and secrets.

No persistent server, shell runtime, filesystem access, WebSockets, cron, or GitHub Actions is used in production. Node scripts and PM2 are development/operations utilities only.

## Modules
- apps/web/src/main.jsx: owner login, conversations, model preference, agent/approval UI, integration status and mobile navigation.
- workers/api/src/index.ts: API routing, sessions, record ownership, D1 persistence, idempotent chat and task state transitions.
- providers.ts: bounded Groq/Gemini requests, explicit demo, model configuration and read-only connection test.
- security.ts: PBKDF2 verification, SHA-256 session/IP hashing, bounded JSON validation and atomic D1 rate counters.
- tools.ts: small validated tool registry, fixed GitHub endpoint, text/JSON processing, model synthesis and optional Apify adapter.
- database/migrations: ordered baseline, workspace extension, rate retention migrations. schema.sql is a fresh-schema reference, not the upgrade mechanism.

## Chat data flow
1. Owner logs in. D1 stores only a session token hash, owner ID, expiration and revocation version; cookie lifetime is 24 hours.
2. Client creates an owned conversation and posts a new UUID requestId, content and provider. Client cannot supply a system instruction or arbitrary message history.
3. Worker checks ownership, claims a 60-second conversation lock, reserves quota and persists a pending user message.
4. Latest 20 completed messages plus the current message are reconstructed from D1, capped at 30,000 characters. User input is at most 6,000 characters.
5. Provider request has a 45-second deadline and 1,200-token output limit. Provider adapters do not silently fall back when configured credentials fail.
6. D1 batch stores assistant response, completes the user message and updates the conversation title. Failures remain visible and can be retried with the same UUID. Successful replay returns the stored reply instead of making another model call.

Streaming is intentionally deferred. Responses are complete JSON, so no partial SSE response is incorrectly treated as persisted completion. Ambiguous model network failures may still incur provider usage; a manual retry is a new provider attempt and reserves quota.

## D1 tables
- conversations: owner, title, timestamps and processing lock.
- messages: role/content, status, provider and unique reply-to relationship.
- sessions: hashed tokens and expiration/version.
- user_settings: provider preference only, no keys.
- rate_limits: per-window atomic counts and expiry.
- agent_tasks: owner, objective, approved plan, provider, status/result/error.
- agent_steps: ordered independent tool inputs, status and result; at most positions 0–2.
- approvals: exact proposed inputs, decision and timestamp.
- tool_runs: execution input/output/status/duration and sanitized failure.

Original unowned data is marked `legacy-unassigned`, not assigned to the owner automatically. Conversation deletion cascades messages. Task deletion cascades steps/logs/approvals. Expired session/rate rows are lazily pruned in bounded batches when settings are loaded. User content persists until explicit deletion; provider-side retention is governed by the provider, not this database.

## Agent state machine
`waiting_approval → queued → running → queued/completed/failed`; rejection/cancellation becomes cancelled. AI planner emits 1–3 fully specified independent tool steps. The backend validates every step against the registry before persisting a plan; arbitrary tool names, input fields and shell/network tools are rejected.

Every task requires owner approval, including deterministic tools. Approval expires after one hour while pending. Approval does not execute; each `/run` call atomically claims one queued step. Concurrent/repeated execution is rejected. No automatic tool retry or model-controlled loop exists. A stale running request is marked failed when inspected after 120 seconds; external status may be unknown and is not automatically retried.

- text.stats and json.format: deterministic backend execution.
- github.repo_info: public metadata at a fixed HTTPS api.github.com repository endpoint; repository components validated, redirects rejected, response bounded to 100 KB.
- research.synthesize: grounded only in submitted source text, labeled as synthesis, not browsing; external text is untrusted data.
- apify.run: explicit approved Actor policy plus primitive-field input schema, owner approval, at most two submissions/day, 60-second Actor timeout, 128 MB requested memory and requested maxTotalChargeUsd 0.1. Provider pricing compatibility must be reviewed; this is not a universal account spending guarantee. No Actors are currently enabled.

Apify launches are asynchronous. A completed tool submission means a run ID was accepted, not that the Actor finished. The status action derives the run ID from the owned saved execution log, never an arbitrary client-provided run ID, and returns at most five dataset items with bounded response size. No paid launch was tested.

## BYOK release gate
Cloudflare authentication and resource listing succeeded. Dedicated D1 creation failed on the account's database-count limit. No Pages production deployment or remote migrations were performed. `wrangler.jsonc` deliberately has no guessed production D1 binding.

After the owner frees an explicitly safe slot or approves upgrading their account:
1. Create `ai-workspace-production`, then add the actual returned database ID to root `wrangler.jsonc` with binding DB and migrations_dir `database/migrations`.
2. Run `wrangler d1 migrations apply ai-workspace-production --remote` against that verified dedicated database only.
3. Create Pages project `ai-workspace` on main. If the name collides, choose a unique project name and update the exact ALLOWED_ORIGIN and saved project metadata.
4. Configure OWNER_PASSWORD_HASH and provider keys as Pages secrets. Do not upload Cloudflare/R2 administrative credentials into the app.
5. Build, deploy `dist`, then verify the actual returned domain, health, owner login, real provider chat, persistence after reload, approval enforcement and deletion. Do not declare live success before these checks.
