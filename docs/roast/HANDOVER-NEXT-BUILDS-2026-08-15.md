# Handover: the two builds requested on 15 August 2026, NOT STARTED

Both were ruled by the founder mid-session, after Tasks 1 to 6 were underway.
Neither was begun beyond the design work recorded here. **They are not
launch-blocking.** This file exists so nothing has to be re-derived.

**Why they were not started, stated plainly rather than excused.** Each is a
multi-file build with a "prove it end to end" clause, and starting either would
have left three features half-built, the tree unpushed, and no merge runbook.
The founder's own tie-breaker was explicit: "If you must choose, Task 1 and
Task 6 land." That is what was done.

---

## BUILD A: External ticketing support

### The blocker to know before starting

**The end-to-end proof cannot be completed in one agent session.** CLAUDE.md
(Verification and gates) says: "Write the migration file only. Lawal applies it
with `supabase db push --linked`." The preview runs on TEST, so until the founder
applies the migration the feature cannot be exercised on the deployment. Plan the
session as: build and write the migration, hand over, founder applies, then prove.

The migration file was written and then REMOVED from `supabase/migrations/`
deliberately, so that no half-applied change sits in the tree with nothing
reading it. Its SQL is preserved below verbatim and is the first step.

### What the investigation established about the current state

- `share_links.event_id` is **NOT NULL** and there is **no destination column**
  (`src/types/database.ts:3179`).
- `/e/[code]` is a **`page.tsx`**, not a route handler: it renders the event page
  in place and books the click on the way through. The reasoning is written into
  `src/lib/broadcast/resolve-short-link.ts` and is deliberate ("Eventbrite does
  not redirect, DICE does not redirect ... the readable address IS the page").
  `/s/[code]` IS a route handler and already redirects.
- The anonymous composer does not create events at all. It stores a
  **Redis-backed draft** (`src/lib/launch/draft-store.ts`) keyed by a shareable
  code, served at `/launch/k/[code]`, with a 30-day TTL and an httpOnly ownership
  token. Artefacts are rendered from `KitDraftPayload`.
- The poster currently prints `eventlinqs.com.au/launch/k/<code>` (finding 74).

### The design decision that follows from that

An external kit for a cold stranger has **no event row**, so the tracked link
cannot hang off `event_id`. It hangs off a `share_links` row with
`event_id IS NULL` and `destination_url = <external>`, which is what makes
`/e/[code]` able to serve both cases and satisfies non-negotiable 1.

**A 302 needs a route handler.** `/e/[code]` is a page, and `redirect()` from a
Server Component emits **307**, not 302. For a GET link click the two are
equivalent in every browser, but the founder specified 302. Either accept 307 and
say so, or convert `/e/[code]` to a route handler that renders internally via a
rewrite, which is a bigger change to a deliberate design. **Decide this first**,
because it shapes the rest.

### The migration, verbatim, as written and removed

```sql
-- 20260815000001_external_ticketing.sql
ALTER TABLE public.share_links ADD COLUMN IF NOT EXISTS destination_url TEXT;
ALTER TABLE public.share_links ALTER COLUMN event_id DROP NOT NULL;

ALTER TABLE public.share_links DROP CONSTRAINT IF EXISTS share_links_target_exactly_one;
ALTER TABLE public.share_links ADD CONSTRAINT share_links_target_exactly_one
  CHECK ((event_id IS NOT NULL AND destination_url IS NULL)
      OR (event_id IS NULL AND destination_url IS NOT NULL));

ALTER TABLE public.share_links DROP CONSTRAINT IF EXISTS share_links_destination_https_only;
ALTER TABLE public.share_links ADD CONSTRAINT share_links_destination_https_only
  CHECK (destination_url IS NULL OR destination_url ~* '^https://[^\s]+$');

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS external_ticket_url TEXT;
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_external_ticket_url_https_only;
ALTER TABLE public.events ADD CONSTRAINT events_external_ticket_url_https_only
  CHECK (external_ticket_url IS NULL OR external_ticket_url ~* '^https://[^\s]+$');

CREATE INDEX IF NOT EXISTS idx_events_internal_ticketing
  ON public.events (start_date) WHERE external_ticket_url IS NULL;
```

**Production ordering: unconstrained.** Unlike `20260808000010`, this is purely
additive, every existing row satisfies the new CHECK unchanged, and nothing reads
the columns until the code lands. It is NOT subject to the section 5a hazard and
can be applied before or after the deploy.

### Where each non-negotiable would be enforced

| # | Requirement | Where it lands |
|---|---|---|
| 1 | Our short link, 302s out, never print the external URL | `share_links.destination_url`; `/e/[code]`; the printed line in `src/lib/launch/bill-ref.ts` and `src/lib/broadcast/poster.ts` |
| 2 | Never claim a sale we cannot see | `src/lib/broadcast/reach.ts` (clicks only, labelled in the organiser's words); `src/lib/broadcast/sales-attribution.ts` must EXCLUDE external events from sold buckets rather than counting them untracked, and its reconcile check must still hold |
| 3 | No fake inventory | `isOrganiserSellable` / `ticketsOnSale` in `src/lib/payments/sale-status.ts` must refuse on `external_ticket_url` **by construction**, and `assertChargePrecondition` in `application-fee.ts` likewise |
| 4 | Not in discovery real estate | `loadHomeUpcoming` (`src/lib/events/home-queries.ts`) and any ranking surface filter `external_ticket_url IS NULL`; the partial index above is that shape. The event page stays live and indexable |
| 5 | Regress nothing internal | The whole existing suite, plus a test asserting an internal event's gate result is byte-identical |

**URL validation** (non-negotiable, and the part most easily got wrong): https
only; reject `javascript:` and `data:`; reject credentials in the URL; reject any
host under our own domain, because a link that redirects back through us is an
open redirect; cap the length; and give a clear error rather than a silent
refusal. Write it as a pure module so it is exhaustively testable without a DB.

---

## BUILD B: The pace engine and the organiser brief

Not started. No investigation was done beyond reading the brief, so nothing here
is a finding; it is the brief restated with the traps that are already visible.

### The four sources must be fetched, not summarised

The founder was explicit: "Fetch and cite each of these; do not take this summary
as the source."

- `https://www.eventist.ca/blog/ticket-sales-pace-calculator`
- `https://www.tickpick.com/blog/organizer/event-marketing-timeline`
- `https://patchboard.co/blog/post/when-do-people-buy-tickets`
- `https://rsvpify.com/event-ticketing-trends-2026/`

Law 7 applies in full: every constant carries its source URL and the date it was
fetched, and where a source gives a range, the module states which end was taken
and why. Note that these are vendor blogs rather than primary research, so the
honest framing is "published industry figures", not "measured".

### Traps already visible from this session's work

1. **Reuse the 7am cron, do not build a second one.** `vercel.json` already
   carries the cron set and `requireCronAuth` fails closed. A second scheduler is
   a second thing to get 401ing silently.
2. **The AI path must be provably live.** `runAssistant` degrades to a fallback
   when `ANTHROPIC_API_KEY` is absent, and the degradation is invisible from the
   outside. The proof that the API was called is the `ai.request` log line with
   `inputTokens`/`outputTokens`, not the presence of plausible output.
3. **Honesty rules are already enforced elsewhere and should reuse it.** External
   events and unknown capacity yield NO verdict. That is the same shape as the
   fee rule added on 15 August: when the live value is unavailable, refuse to
   quote rather than fall back to something written down.
4. **Build 7 is explicitly "build nothing chargeable now".** The deliverable is a
   written trigger with the metric named, in the roadmap, not a feature.
