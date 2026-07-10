# AI layer staging proof - pre-key pass (2026-07-04)

Deployment: `dpl_EuNcTjLYYMb928oa8atW2UZkSd4U`, branch `feat/claude-api`
(commit 837e797), alias
`eventlinqs-app-git-feat-claude-api-lawals-projects-c20c0be8.vercel.app`.

This pass proves everything that can be proven BEFORE the founder provisions
the ANTHROPIC_API_KEY. It is explicitly not the full conversation proof; the
remaining items are listed at the bottom as NOT DONE.

## Proven on the live staging preview

1. `endpoint-proof.json` (raw responses from POST /api/ai/chat):
   - Unknown assistant id: 400 `unknown_assistant`.
   - System-role smuggling in the transcript: 400 `invalid_messages`.
   - Transcript not ending on a user turn: 400 `invalid_messages`.
   - Guest calling the auth-required organiser assistant: 401 `auth_required`.
   - Valid support question with no key provisioned: 503 `unconfigured` with
     the graceful user-safe message (the stub state).
   - Burst of turns: 429 at exactly the 11th counted request in the minute
     window (`ai-chat` limit 10/min), carrying RateLimit-Limit,
     RateLimit-Remaining, RateLimit-Reset, and Retry-After headers.
2. Vercel runtime logs (queried via the log API, excerpt below): one
   structured JSON line per blocked request, hashed identity, no message
   content, correlated 503/429 statuses.

   ```
   {"ts":"2026-07-04T10:55:05.947Z","evt":"ai.blocked","assistant":"support","who":"e302e665a223","reason":"unconfigured"}
   {"ts":"2026-07-04T10:55:06.589Z","evt":"ai.blocked","assistant":"support","who":"e302e665a223","reason":"rate_limited"}
   ```
3. Screenshots of the support surface on /help:
   - `help-support-1440-panel.png` and `-section.png`: desktop idle state.
   - `help-support-1440-asked-panel.png`: a real click on a starter chip and
     the rendered graceful unavailable state (the key stub, end to end
     through the UI).
   - `help-support-390-*.png`: mobile 390, chips wrap, 44px targets.

## Environment note

This preview inherits the general Preview env, which reads the PROD Supabase
project. Accordingly this pass performed GET page loads and unauthenticated
POSTs to /api/ai/chat only: no account was created and nothing was written
to any database. The AI layer itself has no database write path.

## NOT DONE (awaits the founder ANTHROPIC_API_KEY, then a second pass)

- Real conversations on all four assistants with screenshots.
- Handoff proof: a support conversation that raises the handoff flag and the
  resulting email in the support inbox.
- One adversarial content test per assistant (prompt injection, off-topic
  abuse) answered safely by the live model.
- Authed surfaces (dashboard, tickets, event form) exercised end to end,
  against the TEST-database staging deployment, never PROD.
- Cost-guard counter observed accruing real spend in Redis.
