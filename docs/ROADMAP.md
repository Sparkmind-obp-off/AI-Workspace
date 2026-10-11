# Roadmap

## Phase 0 — Scaffold
- [x] Initialize repository and app structure.
- [x] Add initial chat UI.
- [x] Add Worker API and provider adapter placeholders.
- [x] Add D1 schema and security baseline.

## Phase 1 — Functional chat
- [ ] Install dependencies and run a production build.
- [ ] Deploy API and configure one provider secret.
- [ ] Add real streaming responses and robust timeout handling.
- [ ] Persist conversations and messages in D1.
- [ ] Add authentication and rate limiting before public access.

## Phase 2 — Tool calling
- [ ] Add tool registry with typed schemas.
- [ ] Implement calculator and read-only search tool.
- [ ] Validate model tool calls on the server.
- [ ] Persist tool inputs, outputs, status, and citations.

## Phase 3 — Agent runtime
- [ ] Planner and task state machine.
- [ ] Maximum steps, deadlines, retries, and cost budget.
- [ ] Approval queue for consequential actions.
- [ ] Cancel and resume tasks safely.

## Phase 4 — Research and memory
- [ ] Add Apify integration as an optional adapter with hard spending caps.
- [ ] Store sources and evidence, deduplicate results.
- [ ] Add user-controlled memory and deletion.
- [ ] Export reports.

## Acceptance checks
- Health endpoint returns no secret material.
- Chat works in demo mode and with a configured provider.
- Invalid or oversized payloads are rejected.
- Provider errors and rate limits do not create infinite retries.
- Tools cannot be invoked outside the server allowlist.
- External side effects cannot run without required approval.
- Production deployment has auth, scoped database access, and origin-restricted CORS.
