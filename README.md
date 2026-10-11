# AI-Workspace

Private, owner-operated AI assistant and approval-gated agent workspace. Existing repository retained: React + Vite frontend, native Cloudflare Worker backend, Cloudflare D1 persistence. No GitHub Actions or paid infrastructure added.

Repository: https://github.com/Sparkmind-obp-off/AI-Workspace

## Implemented
- Owner login with PBKDF2 password verification, hashed D1 sessions, HttpOnly/Secure/SameSite cookie, logout and revocation version.
- Conversation creation, titles, history, deletion, failed-message state, manual idempotent retry, and real server-side Groq chat.
- Provider adapters: Groq, Gemini, explicitly labeled demo. Missing selected provider keys fail closed, not silently fall back to demo.
- Provider/settings UI, connection tests, persistent provider preference, responsive sidebar and mobile navigation.
- Agent planner or manual tool selection, at most three independently specified steps, persisted approval, one-step execution, logs, cancellation and task deletion.
- Tools: text.stats, json.format, fixed-endpoint public GitHub metadata, model-based source synthesis (not web search), optional allowlisted Apify launch/status/results.
- D1-backed quotas, origin/CSRF checks, bounded requests/context/output, timeouts, security headers and redacted errors.

## Current verification and deployment
As of 2026-10-11:
- Frontend/Worker production build and backend TypeScript checks passed.
- 13 unit tests, 27 local API integration checks, one Chromium end-to-end scenario passed.
- Real Groq response and D1 persistence verified locally; real AI planner verified in browser.
- Groq model selected from the actual account model list: `openai/gpt-oss-20b`. Gemini defaults to documented `gemini-2.5-flash` but has no configured credential and is not live-tested.
- Apify authentication checked read-only; NO Actor runs launched during development.
- npm production dependency audits: zero reported vulnerabilities.
- BYOK Cloudflare authentication succeeded, but D1 creation was rejected because the account has reached its database-count limit. No unrelated resource was modified, deleted, or reused.
- **Production deployment is blocked, not live-verified. There is no production URL yet.** The intended Pages project name is `ai-workspace`; its expected domain is not a claim that it exists.

## Local development
Node.js 22+, npm. Two lockfiles are intentional: the existing root web workspace and standalone API package.

```sh
npm ci
npm --prefix workers/api ci
npm run owner:create
npm run db:migrate:local
npm run build
pm2 start ecosystem.config.cjs
curl http://localhost:3000/api/health
```

`owner:create` writes a random owner password and its PBKDF2 hash into ignored `.private/` files without printing them. Copy the hash value from `.private/owner-secret.secret.json` into an ignored root `.dev.vars` as `OWNER_PASSWORD_HASH`, using a private editor. Add optional `GROQ_API_KEY`, `GEMINI_API_KEY`, `APIFY_API_TOKEN` there. Never use `VITE_*` for secrets. Existing credentials are not overwritten unless `--rotate` is explicitly supplied.

The generated local D1 UUID in `wrangler.local.jsonc` is a local-only identifier, NOT a production database ID. Pages dev uses the same UUID via PM2 flags; Pages rejects custom config filenames, whereas D1 migration commands accept `--config`.

For an explicitly permitted sandbox HTTPS origin, set `WORKSPACE_PREVIEW_ORIGIN` when starting PM2. Production uses only the actual application origin in `ALLOWED_ORIGIN`.

## User guide
1. Sign in with the private owner password. Choose a configured provider, or explicitly select demo.
2. Send a message. Reload and select the saved conversation from the sidebar to restore it.
3. For an agent task, choose AI planner or a manual tool, enter the objective/input, and create a plan.
4. Review every tool and exact input. Approve or reject; approval alone does not execute a tool.
5. Run each queued step explicitly. Inspect output and execution logs. An Apify task's completed submission does not mean its external Actor finished; use the status check.
6. Delete conversations/tasks as needed. Deleting an Apify log does not cancel an already launched external run.

## API
Private endpoints require the session cookie. Writes require an explicitly allowed Origin, JSON where a body is needed, and `X-Workspace-Request: 1`.

| Route | Purpose |
| --- | --- |
| GET /api/health | Public configuration/health booleans, no secret values |
| POST /api/auth/login | Owner password login |
| GET /api/auth/me; POST /api/auth/logout | Session identity/revocation |
| GET/PUT /api/settings | Provider metadata/preference, quotas |
| POST /api/providers/test | Read-only model-list credential test |
| GET/POST /api/conversations | List/create owned conversation |
| GET/DELETE /api/conversations/:id | Restore/delete owned history |
| POST /api/chat | `{conversationId,requestId,content,provider}`; requestId is UUID reused for retry |
| GET/POST /api/tasks | List or create `{objective,provider,steps?}` |
| GET/DELETE /api/tasks/:id | Inspect/delete owned task and logs |
| POST /api/tasks/:id/approve,reject,run,cancel,apify-status | Approval and bounded execution actions |

## Verification commands
```sh
npm run build
npm run typecheck
npm test
npm run test:fixtures
npm run test:integration
npm run test:browser
npm run security:scan
```
Integration/browser tests require the running local app and `.private/owner-password`, or `WORKSPACE_TEST_PASSWORD` supplied through a secure environment. Browser tests currently require a configured Groq key for the real planner check. Install Chromium and its system libraries with `npx playwright install --with-deps chromium` when needed.

**Never run `test:fixtures` against production.** It intentionally resets local quotas and seeds foreign-owner authorization fixtures. Reset local fixtures before repeated acceptance runs to avoid legitimate test rate-limit failures.

## Production next action
Owner must free one safely identified D1 slot or explicitly approve an account upgrade. Then create a dedicated AI-Workspace D1, bind its verified ID, apply migrations, configure Pages secrets, deploy, and run authenticated live acceptance. See docs/ARCHITECTURE.md and docs/SECURITY.md. No database ID is guessed and no unrelated production database is used.

## Not yet implemented/verified
Streaming; public registration/OIDC/multi-user onboarding; search-engine browsing; large-file ingestion; agent dependent-step substitution; automatic background jobs; invoice-grade spend accounting; live Gemini; actual Apify runs; production D1 migrations and live deployed chat. This is a verified local functional slice, not a declared production-ready public multi-user service.
