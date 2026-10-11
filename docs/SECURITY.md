# Security — implemented controls and release limitations

## Credential handling
Provider credentials exist only in ignored local `.dev.vars` / `.private` files during development, or Cloudflare Pages Worker secrets in production. No in-app raw credential storage exists. D1 settings store only provider preference; API status responses reveal availability/model identifiers, never values. Provider error bodies are not forwarded and secrets are not logged. Cloudflare account/R2 administrative credentials are not application bindings and were not committed.

Any credential pasted into chat must be considered exposed and rotated/revoked at its issuer. This includes provider, Cloudflare, R2 access and other tokens. Replace the Cloudflare API token through the project's secure Deploy panel; do not paste replacement production keys into ordinary chat or public GitHub files.

Production configuration, after the D1 blocker is resolved:
```sh
npx wrangler pages secret put GROQ_API_KEY --project-name ai-workspace
npx wrangler pages secret put GEMINI_API_KEY --project-name ai-workspace
npx wrangler pages secret put APIFY_API_TOKEN --project-name ai-workspace
npx wrangler pages secret bulk .private/owner-secret.secret.json --project-name ai-workspace
```
Use interactive private terminal input or Cloudflare dashboard Secrets, not literal secret values in shell commands. Configure only required providers. `owner:create` generates a high-entropy random password and PBKDF2 SHA-256 hash (100,000 iterations, random salt). The Worker uses Web Crypto, not Node APIs. Avoid substituting a weak human password; passkey/OIDC support is future work.

For owner rotation, run `npm run owner:create -- --rotate`, privately deliver the replacement password to the owner, upload the replacement hash and increment `SESSION_VERSION` in Worker vars to invalidate existing sessions. Rotate provider keys at Groq/Google/Apify dashboards, update the corresponding Worker secret, verify connection, then revoke obsolete keys. Redeploy when configuration changes require it. No production secrets have been installed in this session because production D1 provisioning is blocked.

## Authentication and resource authorization
This release is a single-owner private workspace, not public multi-user onboarding. Every private API path requires an unexpired, version-matching D1 session. Cookie is HttpOnly, Secure, SameSite=Strict, path `/`, 24-hour lifetime. Only SHA-256 token hashes are stored. Logout deletes the server-side session.

Every conversation/task route checks both resource UUID and session owner. Message access comes through an owned conversation. Task steps/logs/approvals and Apify results come through an owned task. No anonymous conversation storage or public registration. Legacy unowned records are not automatically exposed. Tests seed genuinely foreign-owned conversation/task fixtures and verify read/delete/approval denial.

## Abuse protection
Atomic D1 counters reserve usage before actions:
- Login: five attempts/IP-hash per 15-minute window, including successful attempts.
- General authenticated API: 120 requests/minute.
- Chat: ten attempts/minute.
- Model work: 100 attempts/day, including failed/ambiguous calls, shared across chat/planning/synthesis.
- Agent creation: 20/day, maximum three steps each.
- Provider connection tests: ten/hour.
- Apify submission: two/day.

Fixed windows can permit boundary bursts. These limits constrain requests and output, not an invoice-grade dollar budget. Additional edge WAF/Turnstile, adaptive abuse controls and load testing are recommended before any public multi-user launch. No paid Actor was launched during testing.

## Input/network/browser policy
- Request body streamed and capped at 24 KB, malformed JSON rejected; chat 6,000 chars, agent objective 4,000 chars, tool source text 5,000 chars.
- Conversation context: last 20 messages, at most 30,000 chars; model output at most 1,200 tokens, persisted response text capped at 20,000 chars.
- Server-generated system policy; client cannot inject system-role message history through the chat API.
- Production Origin allowlist is the actual application domain. Writes additionally require matching Origin and X-Workspace-Request, protecting cookie sessions against CSRF. No wildcard production CORS.
- Tool registry rejects arbitrary shell/HTTP tool names and unexpected fields. GitHub URL is fixed, repository path components validated; redirects are forbidden and response bounded to 100 KB. No arbitrary user-supplied target URL fetching exists.
- Tool/network outputs are rendered as React text, not interpreted HTML. Model synthesis labels source text untrusted and does not give it execution authority.
- Provider requests have a 45-second abort deadline; tool HTTP reads/launch acknowledgments have 12-second deadlines. No automatic billable retries.
- CSP, no-referrer, nosniff, HSTS, permissions policy, frame-ancestor/base/form restrictions are returned. The site must be opened directly if a sandbox iframe is disallowed by CSP.

Prompt injection cannot be eliminated by a prompt. Actual enforcement is the small backend registry, input schemas, owner approval and immutable saved plan. Planner outputs cannot execute directly, change credentials, run shell or introduce new network tools.

## Agent and Apify safety
Approval precedes every execution. An atomic queued→running claim prevents duplicate task execution. Pending approvals expire after an hour. Interrupted/stale requests fail closed, with potentially unknown external outcome, and are not auto-resumed/retried. Cancellation stops unexecuted local steps; it does not reverse external effects already accepted.

APIFY_ACTORS defaults to an empty list. An enabled policy must specify Actor ID, permitted primitive-field types and required fields. Owner must review the Actor's current input schema, trustworthiness, pricing, permissions and required memory/build before enabling it. This deliberately narrow schema supports only primitive fields; complex schemas need a dedicated validator before enablement.

Launch requests ask Apify for maxTotalChargeUsd=0.1, timeout=60 and memory=128. Provider cap support varies by pricing model and does not guarantee a global account spending ceiling. Do not enable an Actor without understanding its billing. Saved run ID/status/dataset can be polled read-only; only five bounded dataset items are returned. Sensitive Actor inputs may be persisted in owned logs, so do not include credentials in tool input.

## Data retention
Conversations/messages and tasks/logs/approvals are retained until owner deletion. Foreign keys cascade child records; running resources reject deletion. Expired sessions and rate rows are pruned lazily on settings reads, up to 500 per table/request. No raw provider keys are stored in D1. Deleting local history does not delete provider-side logs or cancel Apify runs.

## Verification status
Executed: 13 unit tests (including missing credentials/demo, provider headers/errors, schemas and CSRF), 27 D1-backed API checks (ownership, approval, idempotence, persistence/deletion, real Groq and actual 429), Chromium owner/chat/reload/planner/tool/mobile scenario, build, TypeScript, dependency audits and tracked-file secret scan.

Not verified: production migration/deployment/session lifecycle, real Gemini requests, paid Apify run and billing caps, high-load/concurrency soak testing, independent penetration test, public multi-user access. Production is blocked by D1 database-count quota and is NOT declared production-ready.
