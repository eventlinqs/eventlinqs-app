# M1 PLAN. "THE REQUEST", the first module of the event production build.
Session 43, 8 September 2026. Governing text: CLOSE-OUT.md "EVENT PRODUCTION
MODULE. M1 SHIPS WITH LAUNCH", M1.1 to M1.6, plus "M6 REPLACED. THE MONEY MODEL"
and "POSITIONING, LOCKED" (the promise this module delivers is "You've got help").

## What M1 is, exactly, in the owner's words

M1.1 On event creation and in the organiser dashboard: "What do you still need
     for this event?" Multi-select categories, budget band, free text notes.
M1.2 Categories live in the database as a guarded taxonomy, never hardcoded,
     enumerated from source. A guard that fails on drift, exactly as C18
     requires for communities.
M1.3 Free for the organiser, always. Never a blocking step in event creation. An
     event must be creatable with no request and nothing breaks. Prove it.
M1.4 The acknowledgement the organiser sees must be honest. Never imply a
     service that does not exist yet.
M1.5 Admin can see every request with its event context attached.
M1.6 Driven at 390, 768 and 1440. Evidence paths in the ledger.

## What M1 is NOT, and this is the part that keeps it to one form

No supply, no matching, no messaging, no WhatsApp, no quotes, no money. M2 to M7
are explicitly after the launch list. Building any of them here would be the
half-built path the COMPLETION LAW forbids.

## The honest acknowledgement (M1.4), decided before the code

There is no supplier network yet. The owner services the first requests himself
by phone, and CLOSE-OUT says so plainly: "For the first fifty events the owner
does this by phone. The organiser sees a working product. This is deliberate and
correct, not a compromise."

So the acknowledgement says what is true: the request is recorded, a person will
come back to them, and nothing is promised that a machine will do. It must never
say "we are matching you with suppliers" while no supplier exists.

## Schema, and the dependency it inherits

Two tables: the guarded category taxonomy, and the request itself with its lines
and its free text, keyed to the event and the organiser. Applied to TEST, read
back by query.

It CANNOT merge until production carries it, exactly as C10 cannot: the
schema-ahead-of-code guard refuses code that names a column production does not
have. That is one founder command, `npm run migrate:production`, and it clears
C10's three migrations and M1's at the same time.

## Order of work, under the COMPLETION LAW

1. The A, B, C, D triage owed to the owner first (the 7 September Africa
   narrowing says "Report which is which before building"): which of the bundle
   target, WhatsApp share, trust signals and fraud prevention affect an L1
   journey, with evidence, and which are named for the post-launch queue.
2. Migration, applied to TEST, read back.
3. The taxonomy guard, drilled red and green.
4. The organiser surface: the event dashboard entry and the creation flow,
   skippable, never blocking.
5. The admin surface with event context.
6. Tests, canary raised in the same commit.
7. Driven at 390, 768 and 1440 as a real organiser through the real screens.
8. Full gate, draft pull request, ledger, log, review queue, push.
