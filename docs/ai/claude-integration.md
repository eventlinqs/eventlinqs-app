# Claude AI Integration

The AI layer that powers automated assistance across EventLinqs: customer
support, organiser onboarding, buyer first-run help, and the event creation
helper. Built on the Anthropic Messages API through the official
`@anthropic-ai/sdk`, entirely server-side.

Status: built and gate-green on branch `feat/claude-api`. Live operation
requires the one founder step below (the ANTHROPIC_API_KEY).

## The one founder step

Create an API key at console.anthropic.com (Settings, API keys), then:

```
vercel env add ANTHROPIC_API_KEY
```

Add it to Preview (staging) first, then Production when approved. Nothing
else is required: every surface detects the key at request time and comes
alive the moment it exists. Until then the assistants respond with a polite
unavailable message that points at the contact form, and no page breaks.

The key is server-side env only. It never appears in client bundles (every
module under `src/lib/ai` imports `server-only`), never in the repo, and
never in logs.

## Architecture

```
Browser (AssistantPanel, client component, no prompts on the client)
   |  POST /api/ai/chat  { assistant, messages, draft?, userEmail? }
   v
Route handler src/app/api/ai/chat/route.ts
   1. Assistant registry lookup (server-locked prompts)
   2. Supabase auth (per-assistant requiresAuth)
   3. Rate limits: ai-chat (10/min) + ai-chat-daily (120/day), fail-closed
   4. Transcript sanitisation (roles, lengths, control chars)
   5. Server-derived context (org state, ticket state, category list,
      live fee label via getLivePublicFee - never a hardcoded fee)
   v
Service src/lib/ai/service.ts
   1. Monthly cost guard (Redis, month-scoped counter vs budget)
   2. Anthropic Messages API call: structured JSON output, output cap,
      45s timeout, 2 retries with exponential backoff (SDK built-in),
      prompt caching on the stable system prefix
   3. Copy-law enforcement on output (mechanical dash replacement)
   4. Spend recording + structured logging (no message content)
   v
Handoff src/lib/ai/handoff.ts (support paths only)
   Resend email of the transcript to the support inbox when the model
   raises the handoff flag.
```

### Files

| File | Role |
|---|---|
| `src/lib/ai/config.ts` | Model selection, price table, input clamps, timeout, budget |
| `src/lib/ai/client.ts` | Lazy Anthropic client singleton, key detection |
| `src/lib/ai/cost-guard.ts` | Monthly Redis spend counter and budget check |
| `src/lib/ai/logging.ts` | Structured JSON logs, identity hashing, zero content leakage |
| `src/lib/ai/sanitise.ts` | Untrusted input clamps, transcript validation, copy-law output filter |
| `src/lib/ai/knowledge-base.ts` | Support KB rendered from the Help Centre data plus verified boundaries |
| `src/lib/ai/assistants.ts` | The registry: four assistants, prompts locked server-side |
| `src/lib/ai/service.ts` | The one Anthropic call path: structured output, cost, logs |
| `src/lib/ai/handoff.ts` | Human handoff email via the existing Resend path |
| `src/app/api/ai/chat/route.ts` | The single endpoint |
| `src/components/ai/assistant-panel.tsx` | The shared chat UI (design-token compliant) |
| `tests/unit/ai-layer.test.ts` | 31 unit tests incl. adversarial cases |

## Endpoints

One endpoint: `POST /api/ai/chat`.

Request body:

```json
{
  "assistant": "support | organiser-onboarding | buyer-onboarding | event-helper",
  "messages": [{ "role": "user | assistant", "content": "..." }],
  "draft": { "title": "...", "description": "..." },
  "userEmail": "optional, guests only, for handoff follow-up"
}
```

Response: `{ ok, reply, handoff, handoffSent, suggestions[] }` or an error
shape with a user-safe `message`. 429 responses carry RateLimit-* headers
and `retryAfterSeconds`.

The client can never send prompt or system text. `draft` is accepted only
for the event helper, clamped, and injected into the conversation wrapped
in `<untrusted_...>` delimiters, never into the system prompt.

## The assistants

| Assistant | Surface | Auth | Handoff | Output cap |
|---|---|---|---|---|
| `support` | /help (Ask EventLinqs section) | Guests allowed | Yes | 900 tokens |
| `organiser-onboarding` | /dashboard (right column, new organisers) | Required | Yes | 1000 tokens |
| `buyer-onboarding` | /tickets (empty first-run state) | Required by page | Yes | 700 tokens |
| `event-helper` | Event form step 1 (collapsible helper) | Required | No | 1200 tokens |

- The support assistant answers ONLY from the knowledge base, which is
  rendered from the same `src/lib/help-content.ts` data that powers the
  Help Centre (so it can never drift), plus a verified list of what the
  platform can and cannot do. It is instructed to say when it does not
  know and offer the human handoff.
- The organiser assistant knows the real setup flow (organisation, event
  wizard, Stripe payouts) and the organiser's actual state (organisation
  exists, event count), derived server-side from the session.
- The event helper returns typed suggestions (`title`, `description`,
  `category`) the form applies with one tap; categories come from the
  live `event_categories` table, and it may only pick from that list.
- Every assistant writes Australian English, community-first, with no
  em or en dashes and no exclamation marks; the dash rule is additionally
  enforced mechanically on every output.

## Model selection

Default model: `claude-opus-4-8` (all assistants). Override without a
deploy via the `AI_MODEL` env var. The cost estimator prices opus, sonnet,
and haiku tiers and falls back to the most expensive rate for unknown ids
so the guard can never under-count.

## Cost controls

Three independent layers:

1. `ai-chat` policy: 10 turns per minute per user (or IP for guests),
   fail-closed in production.
2. `ai-chat-daily` policy: 120 turns per day per identity, fail-closed.
3. Monthly cost guard: every call's estimated cost (tokens x price table)
   accrues to `ai:spend:YYYY-MM` in Upstash Redis. When month-to-date
   spend reaches `AI_MONTHLY_BUDGET_USD` (default 50), assistants decline
   politely until the month rolls over or the budget is raised.

Prompt caching is enabled on the stable system prefix (the support KB is
about 8k tokens), cutting repeat-turn input cost by roughly 90 percent on
cache hits.

### Estimated cost per feature (claude-opus-4-8, list prices)

Rough per-turn estimates at $5/MTok input, $25/MTok output; cached turns
are far cheaper on input:

| Feature | Typical input | Typical output | Est. cost/turn (cold) |
|---|---|---|---|
| Support | ~9k tokens (KB) | ~300 | ~5.3c |
| Organiser onboarding | ~1.5k | ~400 | ~1.8c |
| Buyer onboarding | ~1.2k | ~250 | ~1.2c |
| Event helper | ~1.5k + draft | ~500 | ~2.0c |

At the default $50/month budget that is roughly 1,000 to 4,000 assistant
turns per month, far above expected launch volume. The authoritative bill
is the Anthropic Console; the guard is a circuit breaker, not a meter.

## Safety rails

- Prompts locked server-side; the registry rejects unknown ids including
  prototype names (`__proto__`).
- User input is untrusted: role validation (no smuggled system turns),
  length clamps (2000 chars/message, 16 messages), control and zero-width
  character stripping, drafts wrapped in untrusted delimiters.
- No tools of any kind: the model has no code path that can read or write
  the database, move money, or touch the funds-holding payment engine.
  Anything money-adjacent routes to existing human-controlled flows (the
  organiser dashboard, the support team).
- Output caps per assistant via max_tokens; structured JSON output so the
  handoff decision is a typed boolean.
- Abuse throttling: per-minute and per-day rate limits, plus the monthly
  budget circuit breaker.
- Logging never includes message content, prompts, emails, or the key;
  identity is a truncated hash.
- Safety-classifier refusals (stop_reason `refusal`) map to a polite
  on-platform message.

## Env vars

| Var | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes (founder step) | Server-side API key |
| `AI_MODEL` | No | Model override (default `claude-opus-4-8`) |
| `AI_MONTHLY_BUDGET_USD` | No | Monthly spend ceiling (default 50) |
| `SUPPORT_INBOX_EMAIL` | No | Handoff destination (default hello@eventlinqs.com) |
| `UPSTASH_REDIS_REST_URL/_TOKEN` | Already set | Rate limits + cost guard |
| `RESEND_API_KEY` | Already set | Handoff email |

## Testing

- `tests/unit/ai-layer.test.ts`: 31 tests covering sanitisation
  (including role smuggling and zero-width smuggling), cost math, budget
  guard (block, fail-open, expiry), registry hardening, prompt copy-law
  compliance, knowledge-base compliance, service behaviour (handoff
  gating, refusal, upstream errors, malformed suggestions), and spend
  recording.
- Staging proof (real conversations, screenshots, rate-limit and handoff
  logs, one adversarial test per assistant) is run on the Vercel preview
  once the ANTHROPIC_API_KEY is added; evidence lands in
  `docs/ai/staging-proof/`.
