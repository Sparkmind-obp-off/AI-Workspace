# Roadmap — actual session status, 2026-10-11

## Phase 1 — Repository audit and baseline
- [x] Inspect existing README, architecture/security/roadmap, frontend, Worker and schema.
- [x] Preserve existing repository/React-Vite/native Worker architecture.
- [x] Baseline frontend build passed; identify invalid Workers type-package version, missing D1/auth, permissive CORS, obsolete Gemini model and plan-only Agent.
- [x] Correct dependencies, commit lockfiles, verify GitHub and Cloudflare account access.

## Phases 2–4 — Chat, persistence and security
- [x] Server-side configurable Groq/Gemini adapters, explicit demo and missing-key errors.
- [x] Verify current provider documentation and actual Groq model availability; configure openai/gpt-oss-20b.
- [x] Real Groq chat, bounded context/output/deadline, failure handling and idempotent manual retry.
- [x] D1 migrations, conversations/messages/titles/history/deletion and settings preference.
- [x] Owner-only authentication, hashed session storage/logout/revocation, foreign-owner checks.
- [x] Atomic D1 request/model/login/tool quotas, restricted origin and CSRF checks, safe rendering/errors and security headers.
- [ ] Streaming, OIDC/passkeys, public signup/multi-user onboarding and independent security review.

## Phases 5–6 — Agent and optional integrations
- [x] Real AI planner or deterministic/manual plan, 1–3 independent validated steps.
- [x] Persist exact plan/steps, mandatory human approval, rejection, one-step execution, logs and cancellation/deletion.
- [x] Atomic task claim and no automatic billable retries; stale execution fails closed.
- [x] Backend text.stats and json.format; fixed public GitHub metadata endpoint; clearly labeled source synthesis rather than fake browsing.
- [x] Optional Apify Actor allowlist/primitive schema, run submission/status/results adapter, requested provider charge cap and daily usage limits.
- [x] Read-only Apify authentication check; no Actor launched and allowlist remains empty.
- [ ] Owner approves specific Actor/schema/pricing, then explicit billable run verification.
- [ ] Live Gemini credential/integration test, sourced web-search adapter, dependent-step output binding and invoice-grade cost tracking.

## Phase 7 — Executed verification
- [x] npm install/ci-compatible locks, frontend/Worker build and backend TypeScript check.
- [x] 13 unit tests passed: provider transport, errors, demo/missing keys, tool schemas, JSON/password validation and CSRF.
- [x] 27 local D1/API checks passed: owner login/cookie/logout, malformed/oversized input, actual foreign-resource denial, idempotent replay, demo and real Groq persistence, approval enforcement, deterministic tool execution, deletion and actual 429 quota response.
- [x] Chromium end-to-end passed: login, chat, reload/history, real planner, approval/tool execution, settings, mobile navigation and no page errors.
- [x] Production dependency audits reported zero vulnerabilities; tracked-file secret scan and git diff whitespace check passed.
- [ ] Production load/soak testing, live Gemini and paid Apify billing-cap tests.

## Phase 8 — BYOK production release
- [x] Cloudflare authentication verified; list resources before changes.
- [x] Confirm no existing AI-Workspace D1/Pages resource to reuse; unrelated applications left untouched.
- [x] Attempt dedicated D1 creation; Cloudflare rejected account database-count quota.
- [x] Prepare advanced-mode Pages build, production vars, local D1 config and secure secret instructions.
- [ ] **Owner action:** free one explicitly safe D1 slot or explicitly approve paid-plan upgrade. No automatic deletion/upgrade authorized.
- [ ] Create dedicated production D1, bind verified ID and safely apply migrations.
- [ ] Create Pages project, install rotated Worker secrets, deploy and confirm actual returned domain.
- [ ] Authenticated live chat/reload/approval/deletion acceptance; only then consider a private-owner production release ready.

## Release conclusion
A functional real-provider workspace is verified locally, not just a mock UI or simulated tool plan. Full BYOK deployment and the production definition of success are still blocked by D1 capacity. No production URL, remote migrations or live deployment success is claimed. No GitHub Actions or paid Actor/infrastructure was introduced.
