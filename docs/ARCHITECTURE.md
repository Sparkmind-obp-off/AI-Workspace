# Architecture

## Principles
1. Independent project; no shared production resources with Vestren, Holbery, or Bozq.
2. Free-tier-first, provider-neutral, and observable.
3. The model proposes; backend policy decides which tools may execute.
4. Secrets are backend-only. Never commit API keys.
5. Consequential external actions require explicit user approval.

## Components
- Web: React + Vite chat interface.
- API: Cloudflare Worker, JSON endpoints under `/api`.
- Database: D1 for conversations, messages, agent tasks, tool runs, and approvals.
- Model adapter: initial Gemini and Groq adapters; configured via Worker environment secrets.
- Agent runtime: staged addition of planner, tool registry, execution limits, and approvals.

## Request path
1. Browser sends a conversation payload to `POST /api/chat`.
2. Worker validates and bounds message history.
3. Provider adapter makes the model request.
4. Worker returns a normalized response.
5. D1 persistence and authentication must be enabled before exposing a multi-user production deployment.

## Initial API
- `GET /api/health`: reports service health and configuration presence (never secret values).
- `POST /api/chat`: validates messages and routes to configured model or demo mode.

## Next architecture milestones
- Durable conversation persistence in D1.
- Authentication and per-user authorization.
- Streaming responses.
- Tool registry with JSON schemas and allowlists.
- Agent task runner with maximum steps, deadlines, and per-task tool budgets.
- Approval records for external side effects.
