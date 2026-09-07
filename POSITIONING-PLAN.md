# POSITIONING PLAN. CLOSE-OUT "POSITIONING, LOCKED" (7 September 2026, owner decision).
Session 43, 8 September 2026.

## Why this is the next item

CLOSE-OUT.md carries three sections dated 7 September that were never started:
POSITIONING (LOCKED), the EVENT PRODUCTION MODULE M1, and the M6 money model
(M2 to M7 are post-launch by their own heading). POSITIONING is AUTHORITATIVE
and it rewrites copy on the same surfaces the L5 launch readiness report has to
sign off, so it lands before L5 rather than after it.

## What the lock says (quoted, not paraphrased)

  THE CATEGORY: "EventLinqs is NOT a ticketing platform. It is the platform
  where events get made. Ticketing is one module. Never describe the platform as
  a ticketing platform, in copy, in metadata, in social cards, in emails, or in
  the About page."
  THE PROMISE: "You've got help."
  THE TAGLINE, UNCHANGED: "Every community. Every event. One platform."
  NEVER: "Never use the phrases 'ticketing platform' or 'ticket seller' for
  EventLinqs." "Never lead with fees or a price comparison." "Never describe
  ourselves as cheaper."

## The measured state before any change

`grep -rniE "ticketing platform|ticket seller"` over src: 41 lines in 26 files.
The strapline "The ticketing platform built for every community" is the platform's
own description in 15 source files: the root title tag, the OG and Twitter cards,
the homepage hero, the footer, the auth shell, the About, Press, Careers and
Events metadata, the site JSON-LD, the help centre, and four transactional email
footers. It is live on production right now inside the Organization schema.

## The line the audit draws

Describing a COMPETITOR as a ticketing platform is allowed and stays. Four lines
do that (careers, help, pricing, hero-categories) and are not touched. Code
COMMENTS are not user-facing copy and are not rewritten. Everything that
describes EVENTLINQS changes.

## The work

1. `src/lib/brand/positioning.ts`: one source for the tagline, the promise, the
   strapline, the category line and the positioning statement, so the strapline
   cannot drift back into fifteen literals.
2. Rewrite every self-description, enumerated from the sweep, on the surfaces the
   lock names: metadata and titles, the homepage hero and subhead, About, Press,
   Careers, Events, /organisers and /for-organisers, the auth shell, the footer,
   the help centre, the legal pages (wording only, never the legal substance),
   the AI assistant guardrails, the editorial copy, the social cards, and the
   four transactional email footers.
3. `docs/STRATEGY-LOCK.md`: ADD the positioning section. Nothing existing is
   overwritten or removed, per the lock's own instruction.
4. `scripts/guards/positioning-lock.mjs`: registered, blocking, fails when a
   user-facing surface calls EventLinqs a ticketing platform or a ticket seller.
   Drilled red and green.
5. Tests in `tests/unit/brand/`, canary raised in the same commit.
6. Driven at 390, 768 and 1440 on a local production build: the homepage, About,
   Press, the auth shell, the footer, an event page's social card, and a rendered
   transactional email.
7. Full gate, then a draft pull request.

## What this item does NOT do

It does not touch the approved homepage composition or dimensions. Copy only.
It does not edit the existing body of docs/STRATEGY-LOCK.md.
It does not touch the pricing page's fee transparency, which is required by the
ACCC all-in display law in CLAUDE.md and is not "leading with fees".
