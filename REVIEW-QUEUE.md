# REVIEW QUEUE FOR LAWAL

One entry per finished item: what a real user can now do, where the evidence is, and
anything you must decide. Newest last. Plain language.

## Needs you (open decisions and credentials)

- **Production catalogue.** The live site has four event pages, two of them payment test
  artefacts. Every city, community and category page resolves but shows almost nothing. The
  only national seeder refuses a production target by design, and this brief makes production
  read only for me. Options, from C:\dev\PRODUCTION-STEPS.md: seed production deliberately
  (needs a decision and a new guarded path), launch thin and let the invitation cards carry the
  rails, or delay go-to-market until real organisers list. Your call.
- **Disk.** About 6.7 GB free on C:. The one big safe win is the Windows Update download cache
  (7.7 GB at C:\Windows\SoftwareDistribution\Download), which needs an admin shell: Settings,
  System, Storage, Temporary files, "Windows Update Clean-up". Downloads holds 15.4 GB of audio
  and Ableton packs; I did not touch them.
- **Production migrations for A2**, when A2 merges: 20260903000001 and 20260903000002 are on
  TEST only. Applying them to production is yours: link to gndnldyfudbytbboxesk, read the ref
  back, then `supabase db push --linked`. The code is written so it does not matter which of
  the code and the schema deploys first: the second migration keeps events.virtual_url inert
  either way.

- **Google Maps keys for A3 (two Cloud console steps, both IMPOSSIBLE for a machine without
  your Google credentials).** (1) The browser key is referer restricted to www.eventlinqs.com.au,
  so the venue finder works on the live site and nowhere else: add http://localhost:3311/* and
  https://*.vercel.app/* under its Website restrictions so the pick can be driven off production.
  (2) GOOGLE_MAPS_API_KEY on production, preview and local is the SAME value as the browser key,
  and a referer-restricted key cannot serve the Geocoding API, so a typed address is saved with
  no coordinates today. Mint a separate server key (Geocoding API enabled, no website
  restriction) and set it as GOOGLE_MAPS_API_KEY on production and preview. Then one command
  proves both: `node --env-file=.env.local scripts/ops/verify-google-maps-keys.mjs`. The
  build guard geocoding-key-posture goes from SKIP to PASS on its own once the key is distinct
  and Google answers OK.
- **Production migration for A3**, when A3 merges: 20260904000001 (events.venue_geocode_source,
  venue_geocoded_at) is on TEST only. Same procedure as the A2 pair; the schema-ahead-of-code
  guard refuses the production build until it is applied, by design.
- **Production migration for A4**, when A4 merges: 20260904000002 (ticket_price_history, its
  two deferred triggers, record_tier_price_history and save_dynamic_pricing, plus the backfill of
  one listed row per existing tier) is on TEST only. Same procedure as the A2 pair and A3; the
  schema-ahead-of-code guard names ticket_price_history.id ABSENT on production and refuses the
  production build until it is applied, by design. Apply A2, A3 and A4 in version order in one
  `supabase db push --linked` after reading the ref back, then
  `node scripts/ops/verify-production-schema.mjs`.
- **Production migration for B1**, when B1 merges: 20260905000001 (the eight ticket_scans
  columns, door_staff_for_event, door_validation_set, sync_offline_scans, resolve_scan_review,
  and `CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions`, which is a no-op on a
  Supabase project because pgcrypto is already there) is on TEST only. Same procedure as A2, A3
  and A4, in version order, one `supabase db push --linked` after reading the ref back, then
  `node scripts/ops/verify-production-schema.mjs`. The schema-ahead-of-code guard names
  ticket_scans.client_scan_id ABSENT on production and refuses the production build until it
  is applied, by design.
- **A Stripe test secret for the local server (your `stripe login`, or nothing).** Since
  2 September no local drive can pay: Vercel will not hand a sensitive value back, and both keys
  the Stripe CLI stores expired in July. A4's two buyers therefore paid on the Vercel preview of
  the branch, which is a real deployed surface holding the test secret and reading TEST, and the
  organiser and the stranger ran locally; the evidence names the origin on every buyer line. If
  you want every leg on one origin, run `stripe login` once on this machine and
  `node scripts/ops/after-stripe-login.mjs` proves it. Nothing in A4 waits on this.
- **A hole in no-plaintext-credential, its own small item, not pulled into A4.** The guard's
  regex needs at least one character before the credential word, so its own headline case
  `const PASSWORD = '...'` is not caught, while `const NEW_PASSWORD = '...'` is. Widening it
  catches 20 sites today: journeys 1, 2 and 8, two break-attempt scripts, three sweep scripts,
  six verify scripts and four unit-test fixtures, every one a per-run minted value or a fixture,
  none a real credential. The fix is one regex character plus twenty one-line edits to mint at
  runtime and a drill test; about an hour. Decide whether it goes before or after Phase B.
- **The event page can lag a purchase by up to five minutes, by its own design.** Found on the
  A4 drive: the tier pill said "Only 4 left" beside a row saying "Only 2 left". The event page
  is ISR with a five-minute revalidate (src/app/events/[slug]/page.tsx, the reason at line 85),
  the availability pill reads the inventory cache through the static path, and a purchase
  refreshes the cache but does not revalidate the page. So for up to five minutes after a sale
  the pill, the price and the price history can be stale; the checkout resolves the true price
  at reservation, which the A4 drive proved. It self-heals on the next render. Decide whether a
  purchase should revalidate the event page (one tag call in the reservation and webhook paths,
  small) or whether the five-minute window stands. Not changed in A4.

## A1. Production is live on main, and the log branch no longer builds

**What changed for a real person:** nothing they can see yet, and that is the point. The live
site had been serving the previous release for a day because the production build was refused
by our own environment guard: a secret pasted with a trailing newline. It now serves main, and
every future merge will deploy again. Pushing this log to its branch used to fire a failing
production build each time; it no longer does.

**Evidence:** C:\dev\EVIDENCE\A1\ (the repair run, the smoke statuses, 21 screenshots).

**Decide:** nothing for this item. The secret was replaced with a fresh one; no guest order
link had ever been minted with the old value, so nothing was invalidated.

## A2. Virtual and hybrid events: a livestream ticket now reaches the stream

**What changed for a real person:** an organiser can run an event online, in the room, or
both at once. On a hybrid event each ticket tier says who it admits: "In the room" admits at
the door, "Watch the livestream" admits to the stream. The organiser pastes the stream link
(YouTube Live, Zoom, StreamYard, any https page, or an rtmp address), picks who can watch
(anywhere, or a region such as Australia and New Zealand, or a list of countries), and cannot
publish a livestream without a link. The public event page states the reach and never the
link. A viewer who takes a livestream ticket receives "Join the livestream" on their ticket,
on their order confirmation and in the confirmation email; the watch page checks the ticket,
its tier, its status and the viewer's country before it shows the stream, and every refusal
says why in one sentence. The room under the stream has chat, questions and reactions; the
organiser answers questions, hides messages and posts as the organiser from a Stream tab on
the event dashboard. A wrong ticket secret is a 404, a walk-in ticket is refused with "this
ticket admits you at the door", and a viewer outside the reach is told the reach.

**Evidence:** C:\dev\EVIDENCE\A2\ (the three drives, 28 verdicts each at 1440, 768 and 390;
axe; Lighthouse on the preview; the schema proof on TEST; the two guard proofs).

**Decide:**
- Apply the two A2 migrations to production, in this order, then verify with one command:
  `supabase link --project-ref gndnldyfudbytbboxesk` (read the ref back), `supabase db push --linked`,
  then `node scripts/ops/verify-production-schema.mjs` (it pulls production's public values
  through the Vercel CLI, probes read only, prints PASS or FAIL, never prints a key).
  Until that is done, the production build refuses itself by design (the schema-ahead-of-code
  guard) rather than serving a ticket page that 500s, so the PR is safe to merge before or
  after; it deploys only after.
- The livestream ticket in the drive was FREE. A paid livestream ticket reaches the same
  confirmed status through the Stripe webhook that journey 3 proves; the watch gate reads the
  ticket's status and its tier's admission, not its price. If you want the paid path driven
  through the watch page as well, say so and it is one journey leg on a Stripe-connected
  TEST organiser.

## A3. Venue geocoding: find the venue, and the event lands on its city map

**What changed for a real person:** on the Location step of the event form an organiser now
types a venue or an address into "Find the venue" and picks it from a list; the venue name,
street, suburb, state and postcode fill themselves, the map card under the fields shows where
the pin lands, and the event page and the city map carry that pin from the stored coordinates.
Nothing is typed twice and nothing is guessed. If the organiser prefers to type the address by
hand, that still works exactly as before. On a browser the key does not allow, the finder says
so in one sentence and gets out of the way. Every event now records where its coordinates came
from (a pick, the server, or nothing yet), and a TEST-only backfill is ready to geocode the
existing events the day a server key exists.

**Evidence:** C:devEVIDENCEA3 (the six drives, 7 of 7 REAL and 13 of 13 STUBBED at 1440,
768 and 390; axe 10 scans 0 violations; Lighthouse on the preview; the schema proof on TEST; the
guard proofs; the key probes).

**Honest limit:** the pick against Google itself was driven with a stand-in built from Google's
real answer for Forum Melbourne, because the browser key refuses every origin except
www.eventlinqs.com.au and this build never writes production. The same journey drives the real
pick, unchanged, the moment the referers above are added.

**Decide:** the two Cloud console steps and the production migration listed under Needs you.

## A4. Price history: a buyer can see how the price has moved

**What changed for a real person:** every event page now carries a "Price history" block under
the tickets: when the event was listed and at what price, every time the organiser raised or
lowered it, and every time a dynamic-pricing step was crossed as tickets sold, each with its
date and in plain words ("Lowered to AUD 28.00", "Rose to AUD 40.00 at 50% sold"). A moved
price also says what it moved from right under the number ("Up from AUD 28.00"). The history is
written by the database itself, so nothing an organiser or the platform does can forget a move
or invent one: saving dynamic-pricing steps that do not change today's price records nothing,
and editing an event keeps its history. On the organiser side, the dynamic pricing screen,
which existed but nothing linked to, is now a Pricing tab on the event overview and a quick
action, so an organiser can reach it with a mouse.

**Evidence:** C:devEVIDENCEA4 (three drives, 20 of 20 at 1440, 768 and 390 on the final
tree; axe 6 scans 0 violations; Lighthouse on the preview; the schema proof on TEST; three
guard proofs; the preview purchase probe). Screenshots committed under
docs/verification/journeys-2026-08-28/a4-price-history/.

**Honest notes:** the two buyers in each drive paid on the Vercel preview of the same commit
rather than the local server, because only the preview holds the Stripe test secret; the
organiser and the stranger ran locally, all against one TEST database, and every buyer line
names its origin. Mobile Lighthouse on the event page is 66, the same platform-wide figure A2
and A3 recorded, not A4's cost. The axe scan of the first drive found the ticket selector's
"Only 2 left" line failing contrast on the white card, a line that predates A4; it is fixed in
this item along with the access-code refusal beside it.

**Decide:** the production migration and the three items under Needs you (the migration, the
optional `stripe login`, the credential guard's regex hole, and the event page's five-minute
window).

## B1. The door works without a signal

**What changed for a real person:** a phone at the gate now downloads the door list the moment
the scanner opens ("Offline ready. 3 tickets, downloaded 6:27 am, valid until tomorrow 6:27 am")
and keeps scanning when the signal goes: a valid ticket is admitted, a used one is refused with
how long ago it was used, a made-up code is refused, and every decision is queued. If the phone
is reloaded with no signal, the scanner comes back with its list and its queue. When the signal
returns the queue syncs by itself (or on Sync now). If two doors both admitted the same ticket
while offline, the first to sync wins and the second is told on its screen that the ticket was
admitted at another door first; the organiser sees the same thing on the Attendees page, in a
Door review panel naming both doors and both times, and marks it resolved with a note. The list
on the phone never holds a ticket's secret, only a hash of it, so a lost phone cannot forge a
ticket. The list is valid for 24 hours and admits nobody after that until it is refreshed.

**Evidence:** C:\dev\EVIDENCE\B1\ (three drives; the final one 38 of 38 at 1440, 768 and 390
on the final tree, 0 server errors; 21 in-journey axe states and 6 static scans, 0 violations;
Lighthouse on the preview; the schema proof on TEST with 29 checks; the guard proofs).
Screenshots committed under docs/verification/journeys-2026-08-28/b1-offline-door/.

**Honest notes:** the drive cuts the network with the harness (Playwright's offline switch on
each door) and pastes the ticket link the email carried into the manual entry, which is the
same string the QR encodes; headless Chromium has no camera. The offline check hashes the
ticket's secret rather than an HMAC because the platform's tickets are secret-bearer until B4;
the store is versioned so B4 extends it. Mobile Lighthouse is 94 on the scanner and 78 on the
attendees page, the platform-wide shell figure A2 to A4 recorded. Two things found on the way
and fixed here, neither B1's: at 768 every dashboard page with a wide table ran past the
viewport (one class on the shared layout), and the attendee table's scroll region was not
reachable by keyboard.

**Decide:** the production migration under Needs you. Nothing else.
