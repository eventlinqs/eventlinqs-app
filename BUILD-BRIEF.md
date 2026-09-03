EVENTLINQS SCOPE v5 COMPLETION BUILD

Repo C:\dev\EventLinqs\eventlinqs-app, branch integration/launch, freshly cut
from main at 48fe08f7. Working tree clean.
Authority: docs/EventLinqs_Scope_v5.md section 3, all eighteen sections.
The gap analysis is at C:\dev\SCOPE-AUDIT.md. Read it first. It is accurate.

FOUNDER RULING, 3 September 2026, the only scope deferral:
  Africa expansion is a later stage. DEFER and do not build:
    - 3.16 multi-language UI (French, Yoruba, Swahili, Zulu). English only.
    - 3.9 phone OTP login.
  Record both as DEFERRED BY FOUNDER, not as missing.
EVERYTHING ELSE IN SECTION 3 GETS BUILT.

=====================================================================
LAWS. THESE OVERRIDE SPEED, ALWAYS.
=====================================================================
- PowerShell 5.1. Prefix: $env:Path = "C:\node24\node-v24.19.0-win-x64;" + $env:Path
- Repo CLAUDE.md is the single source of truth. Scope v5 is the authoritative
  feature scope. Never invent module or section numbers.
- PRODUCTION Supabase gndnldyfudbytbboxesk: READ ONLY. Every migration goes to
  TEST vkapkibzokmfaxqogypq only. Link and READ THE REF BACK before every
  supabase command. Never assume.
- Australian English. No em dashes, no en dashes, no hyphens surrounded by
  spaces. Lawal is sole author: zero AI trailers in every commit.
- Disk floor 5 GB, never breached. Log free space at the start and end of every
  item. Below 6 GB, reclaim before continuing.
- The pre-push hook runs the full suite and .env.local makes two suites fail to
  collect. Park it around every push and restore it in a finally:
    $p=@(); try { if (Test-Path ".env.local") { Move-Item ".env.local" ".env.local.parked" -Force; $p+=".env.local" }; git push origin integration/launch } finally { foreach ($f in $p) { Move-Item "$f.parked" $f -Force } }

THE COMPLETION LAW. This is the one that matters most.
  ONE ITEM AT A TIME, FINISHED, BEFORE THE NEXT BEGINS.
  An item is finished only when ALL of these are true and logged:
    1. Schema: migration written, applied to TEST, verified by querying it back.
    2. Code: built, typechecked, linted, no silent catches.
    3. Tests: real tests added. The suite grows and the canary baseline is
       raised in the same commit.
    4. Guard: where the feature has an invariant that could silently break,
       a registered blocking guard, PROVEN to fail against the broken state and
       pass against the fixed one. Show both outputs.
    5. DRIVEN: a real browser, as a real organiser or a real attendee, at 390,
       768 and 1440, with screenshots saved under C:\dev\EVIDENCE\<item-id>\.
       A green unit test is not evidence. A driven flow is.
    6. REGRESSION: the FULL gate set green after the item, not before.
       Build, every guard, the complete suite, lint, typecheck, axe zero
       violations at every impact level on affected surfaces, Lighthouse.
       If the item broke anything that used to work, fixing that is part of the
       item, not a later task.
    7. Committed, Australian English, no trailers, and pushed.
  NEVER start item N+1 while item N is partially built. If an item turns out to
  need something from a later item, build the minimum of that dependency
  properly, note it, and continue.

SELF REVIEW, after every PHASE:
  - Run the repo's brief-roast skill against the phase's requirements.
  - Write the result into C:\dev\BUILD-LEDGER.md as MET / PARTIAL / NOT MET
    with evidence paths.
  - Anything not MET is finished before the phase closes.

WHAT LAWAL REVIEWS:
  - C:\dev\BUILD-LOG.md, running, newest last, timestamped.
  - C:\dev\REVIEW-QUEUE.md: one short entry per finished item saying what a
    real user can now do that they could not before, the evidence path, and
    anything he must decide. Plain language, not jargon.
  - C:\dev\BUILD-LEDGER.md: the requirement-by-requirement verdict.
  Push all three to the ops/session-log branch after EVERY item.

=====================================================================
PHASE A. SHIP THE BASELINE, THEN CLOSE THE DANGEROUS SMALL GAPS.
=====================================================================
A1. main is at 48fe08f7. Confirm production www.eventlinqs.com.au has actually
    deployed it: the sentry-release in the served HTML must NOT be 9cf7d365.
    If it has not deployed, find out why and report it. Then drive the live
    smoke checks: homepage, /events, /pricing, /organisers, a community page, a
    city page, the sitemap, and one social card fetched from the live og:image.
    Log every status code. Fix anything red before building anything new.

A2. 3.11 VIRTUAL AND HYBRID EVENTS. Highest risk item in the audit.
    events.virtual_url is captured by the organiser form and NEVER shown to a
    ticket holder. An organiser can sell a virtual ticket and the buyer can
    never reach the stream.
    Build: the stream link surfaced to a CONFIRMED ticket holder only, on the
    ticket page and in the confirmation email, gated the same way the bearer
    ticket is; hybrid tiers so one event sells both in-person and virtual; geo
    restriction; and in-stream chat or Q&A per the scope.
    Drive it: buy a virtual ticket on TEST, reach the stream link, and confirm a
    non-holder cannot.

A3. 3.1 VENUE GEOCODING. Verify GOOGLE_MAPS_API_KEY first: Geocoding API and
    Places Autocomplete must both return OK, not REQUEST_DENIED.
    IF OK: build Places autocomplete on the venue field, geocode server side,
    persist venue_latitude, venue_longitude and venue_place_id, show an embedded
    map preview in the form, and write a TEST-only backfill for existing null
    coordinates. Drive it and confirm the event appears on its city map.
    IF REQUEST_DENIED: the founder has not yet minted the server key. Build
    everything EXCEPT the live geocode call, behind a clearly named guard, with
    tests against a stubbed client, so pasting the key is the only remaining
    step. Log it as BLOCKED ON FOUNDER, KEY ONLY. Do not stall.

A4. 3.3 Price history shown on the event page.

=====================================================================
PHASE B. EVENT DAY. A BAD DOOR LOSES AN ORGANISER FOR EVER.
=====================================================================
B1. 3.13 OFFLINE VALIDATION. The scope calls this critical for outdoor events
    and specifies a 50,000-ticket local cache.
    Build: an IndexedDB validation set downloaded when the scanner opens,
    offline scanning against it, an offline queue of scans, and reconciliation
    on reconnect that resolves double-scans correctly and never admits the same
    ticket twice across two devices.
    Drive it: scan with the network disabled, then reconnect and prove the queue
    reconciles.
B2. 3.13 Multi-scanner realtime sync over Supabase Realtime, so two doors on the
    same event see each other's scans immediately. Drive it with two browsers.
B3. 3.13 Door sales via Stripe Terminal.
B4. 3.12 HMAC-SHA256 ticket signing, the 30-second rotating QR, per-event
    signing keys held in a vault, and the anti-screenshot animated watermark.
    CRITICAL: codes already issued must keep working. The generator is
    authoritative. Migrate forward without invalidating a single existing
    ticket, and prove that with a test against real existing codes.
B5. 3.12 Apple Wallet and Google Wallet passes, and an attendee PDF ticket.

=====================================================================
PHASE C. 3.4 SOCIAL AND COMMUNITY. THE SCOPE CALLS THIS THE MOAT.
=====================================================================
C1. Who's Going feed. Respect the existing GOING_THRESHOLD honesty rule and
    privacy: attendees opt in to being visible.
C2. Event activity feed, comments, and organiser pinned announcements, with
    moderation and reporting.
C3. Post-event photos, ratings and reviews, with moderation.
Everything here is public user content. Build the abuse controls with it, not
after: report, hide, block, and an admin moderation queue.

=====================================================================
PHASE D. DISCOVERY AND INTELLIGENCE.
=====================================================================
D1. 3.10 Meilisearch: typo tolerant, faceted, instant. Replace the Postgres
    ilike search. Keep a working fallback if the index is unavailable.
D2. 3.10 Global map of all events with clustering.
D3. 3.10 Trending computed from ticket velocity, not curation.
D4. 3.5 SMARTLINQ. Build exactly what the scope specifies: the linqs graph with
    source_entity_type, target_entity_type, linq_type and weight; weighted
    scoring; a 60/40 blend of collaborative and content filtering; a 10 percent
    exploration cohort; precision@10 evaluation; and a Redis-cached
    recommendation set meeting a 200ms p95. Measure the p95 and report it.
D5. 3.17 PostHog wired so the scope's conversion definition (unique checkout
    initiations over unique event page views) can actually be computed.
    Attendee demographics, marketing performance (email open and click, push
    click-through), and the nightly BigQuery export.

=====================================================================
PHASE E. GROWTH AND REVENUE.
=====================================================================
E1. 3.6 Loyalty points, attendance badges, referral rewards currency, organiser
    leaderboards, Backstage Credits. Do not confuse these with the existing
    inventory scarcity badges in src/lib/events/badges.ts.
E2. 3.14 Organiser email campaigns to attendees, SMS campaigns, the embeddable
    purchase widget, the affiliate and influencer programme with commission and
    attribution, and the AI chatbot.
E3. 3.8 Built-in resale market. Australian Consumer Law binds this: the existing
    legal pages at src/app/legal/refunds and src/app/legal/terms PROHIBIT resale
    above face value. Build a capped resale that honours that, and update those
    pages in the same item so the product and the terms agree.
E4. 3.7 Multi-currency display and settlement, instant payout for a premium fee,
    the automated chargeback evidence pack, and Apple Pay and Google Pay express
    checkout.
E5. 3.7 PAYOUT TIER PROMOTION ENGINE. The schema already carries payout_tier,
    total_event_count, total_volume_cents and tier_progression_log. The only
    writer sets tier_1 for ever. The thresholds are the founder's own stated
    rules and are not a guess:
      Tier 1: payout three days post-event, 20 percent reserve.
      Tier 2: pre-event payout, after the first successful event, $50,000 cap.
      Tier 3: reduced 10 percent reserve, $250,000 cap, after five events AND
              $50,000 volume.
    Build automatic promotion against those, write every move to
    tier_progression_log, and drive an organisation from tier 1 to tier 3 on
    TEST.

=====================================================================
PHASE F. SUPPORT, ADMIN, SUSTAINABILITY, SECURITY.
=====================================================================
F1. 3.18 Support ticket system.
F2. 3.18 FAQ and knowledge base editor.
F3. 3.18 Chatbot configuration surface.
F4. 3.18 Sponsored and featured listing management with ad revenue tracking.
F5. 3.15 Paperless and carbon-neutral badges, charity integration, and a
    sustainability category and filter.
F6. 3.9 Apple login, Facebook login, and mandatory 2FA for the organiser Owner
    role.
F7. Make axe a BLOCKING CI gate. CLAUDE.md records that it is not one today, so
    WCAG 2.1 AA is asserted by hand rather than enforced. Enforce it.

=====================================================================
FINISHING
=====================================================================
Re-run the full Scope v5 audit from scratch, the same way C:\dev\SCOPE-AUDIT.md
was produced, and write C:\dev\SCOPE-AUDIT-FINAL.md. Every one of the eighteen
sections must read BUILT, or DEFERRED BY FOUNDER for the two Africa items, or
carry a precise reason it does not.

Then, at the top of C:\dev\BUILD-LOG.md:
- Every item built, with its evidence path
- Every requirement still not met, and exactly why
- Anything that needs a founder decision or a credential
- Your direct answer: would this stand comparison with Ticketmaster and
  Eventbrite on the journeys a real user takes? Name specifically where it
  would not.

Create C:\dev\BUILD-COMPLETE.txt ONLY when every phase is finished and the final
audit is written. Never create it for any other reason.

=====================================================================
WHAT "DRIVEN" MEANS, AND IT IS NOT NEGOTIABLE
=====================================================================
- Every feature is exercised through the SAME USER INTERFACE a real person
  sees. Not through an API call, not through a direct database write, not
  through a test harness shortcut. If a real organiser or attendee cannot
  reach it with a mouse, a finger and a keyboard, it is not done.
- If a journey only passes because a script seeded state a real user could not
  create for themselves, that journey FAILS. Say so and build the missing path.
- The item is not finished until production deploys green with it included.
  A green local build that Vercel rejects is not a finished item.
