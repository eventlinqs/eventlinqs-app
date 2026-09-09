# UX3 and UX4 PLAN, prepared 9 September 2026 (session 57)

Grounded in a full audit of the notification path, not in assumption. This is the
plan; nothing here is built yet.

## WHAT EXISTS TODAY, established by reading the code

**Email transport.** Resend only (`resend@^6.18.1`). Three modules with a
deliberate boundary: `src/lib/email/sender.ts` (who mail is FROM),
`src/lib/env/destinations.ts` (where platform mail GOES),
`src/lib/email/send.ts` (how it leaves). `sendEmail()` at `send.ts:199` is the
canonical send; four senders bypass it with their own `new Resend(...)` because
they need attachments or a different from-address.

**The owner's destination.** `alertDestination()` returns
`PAYMENT_ALERT_EMAIL` or falls back to `PLATFORM_INBOX`. Note
`alerts@eventlinqs.com` HARD BOUNCED on 2026-08-03 (550 5.4.1) and is recorded
as unusable.

**The two alert channels exist ONLY in CI.** `scripts/ops/alert-dispatch.mjs`:
4 Resend attempts with backoff, then a GitHub issue as channel 2, and a non-zero
exit if both fail. Nothing inside `src/` can reach it. Every in-app alert is
single-channel, single-attempt Resend, which is the exact shape H2.4 was raised
about.

**The five owner notifications UX3 asks for: ZERO of five exist.**

| Event | Where it would go | Today |
|---|---|---|
| New organiser account | `src/app/api/auth/signup/route.ts:264`, `dashboard/organisation/actions.ts:63` | only the USER is emailed; `createOrganisation` sends nothing at all |
| Connect onboarding started | `src/app/api/stripe/connect/onboard/route.ts` | zero matches for sendEmail / alertDestination |
| Connect onboarding complete | `src/lib/stripe/connect-handlers.ts:22` (`fullyOnboarded`) | writes `tier_progression_log` and nothing reads it as an alert |
| Event published | `dashboard/events/actions.ts:762` `publishEvent()` | a Plausible ping and nothing else |
| Every paid order | `api/webhooks/stripe/route.ts:524` | buyer gets tickets, organiser gets a payout notice, owner gets NOTHING |

The owner is emailed about **faults only**: health CRITICAL/RECOVERED, the
payment sentinel, the auth sentinel, connect divergence, a refund that failed at
the bank, and support handoffs. There is no business or growth notification at
all.

**Persistence.** `public.notifications` exists but it is the ATTENDEE lifecycle
alert log (`type` CHECK: just_announced, on_sale, going_fast, last_chance,
tonight, waitlist_available; `channel` CHECK: push|email; unique per
user+event+type). It is not an owner inbox. There is **no** `email_log`,
`outbox` or admin-notification table anywhere. A failed send leaves a
`console.error` and nothing else.

**Retry.** None in-app. `sendEmail` is a single unretried POST and every caller
swallows the throw.

**The admin screen.** `/admin/notifications` exists and is a THREE-TILE derived
count (open disputes, pending refunds, KYC review). Its empty state says "New
alerts appear here as they arise" and nothing can arise, because there is no
store behind it.

**A defect found in passing:** `src/app/api/cron/queue-admit/route.ts` documents
itself as running every minute via Vercel Cron and is in NO `vercel.json` crons
entry (17 entries, 18 cron directories). The virtual-queue admission batch never
runs.

## THE BUILD (UX3)

1. **A real notification spine.** One table (`platform_notifications`) with
   kind, subject ids, payload, a deep link into admin, and delivery state
   (pending / sent / failed / retried), written in the SAME transaction as the
   state change wherever possible so it cannot be lost.
2. **The five business events**, each proven by DRIVING the real action on TEST,
   never by asserting a code path exists.
3. **A dispatcher that cannot fail silently (UX3.2).** Retry with backoff, and
   escalation to a second channel, reusing the SHAPE proven in
   `alert-dispatch.mjs` rather than inventing a second one. Drill the FAILURE
   path, not only the success path.
4. **Volume control from the start (UX3.3).** Order notifications individual
   until a configurable daily count, then a digest. The threshold is ONE named
   constant and the digest is drilled at the boundary.
5. **The admin feed (UX3.4)** reads the same store, so the tile grid stops
   claiming alerts appear that cannot.
6. **A guard** that no state change in the five can complete without a
   notification record. Proven to refuse as well as to pass.

## THE BUILD (UX4)

Routing, on top of UX3's spine:
- **UX4.1 daily state email** at a fixed time whether or not anything is wrong,
  carrying main's colour and commit, production's Ready state and commit, what
  landed in 24h, what is open and for how long, WHEN THE BUILD LAST PUSHED,
  failing branches one line each, and events/tickets/organisers. Its ABSENCE is
  itself the alert.
- **UX4.2 stall alert**: nothing pushed in six hours while the watchdog runs.
  This is the condition that cost a full day and that no failure notification can
  detect, because a stall produces silence.
- **UX4.3 outage-only immediate**, visually distinct from a branch gate.
- **UX4.4 business immediate** (this is UX3's half).
- **UX4.5 branch gate failures stop being email** and become one line in the
  daily digest, without silencing the gate itself.

Each proven by driving it: stall the watchdog deliberately, fail a branch, fail
main, publish on TEST.

## THE ORDER, AND WHY

UX3 first: UX4 is routing, and there is nothing to route until the spine and the
five business events exist. UX4.1's daily email also needs the counts UX3's store
provides.
