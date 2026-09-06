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
- **Production migration for B2**, when B2 merges: 20260905000002 (ticket_scans joins the
  supabase_realtime publication, the door list leads with ticket_id, scan_ticket takes an
  optional device id, door_realtime_enabled() for the build guard) is on TEST only. Same
  procedure, in version order after 20260905000001. Until it is applied the door-live-published
  guard FAILS a production build by name ("ticket_scans is NOT in the supabase_realtime
  publication"), because a door on a project without the publication would subscribe, say it
  is live, and never hear another door; refusing the build is the honest state.
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

## C1 (5 September 2026): the red main is repaired, and the venue source is a real database type

**What changed for a real user:** nothing an attendee sees. An organiser who opens an event's
edit page now sees one fee line on the revenue summary instead of two: "Platform fee", with
any old processing amount from before 15 August folded into it, so the net is unchanged. That
second line had been there since the one-fee decision and the guard that polices fee copy had
missed it because it only knew the singular.

**What changed under the floor:** the types file CI compares with production is once again
exactly what the generator writes, and the three hand edits that turned main red are gone. The
"who wrote these coordinates" column on events is now a proper Postgres type that only accepts
places, geocoding or manual, so nobody has to hand-write that list into a generated file
again. The guard that compares types with the live schema had a blind spot (it skipped every
value the generator wraps onto more than one line, which included ten of our enums); it is
fixed and tested. The guard can now be run on this machine in both directions, using the login
the Supabase CLI already holds, so a push never goes out with that check unproven.

**Evidence:** C:\dev\EVIDENCE\C1\ (the before and after readings of TEST, the guard passing and
failing against production, the five drills, the three drives at 1440, 768 and 390 each 13 of
13 with 0 errors, the guard proofs for the fee line, the builds and the suite). Screenshots
committed under docs/verification/journeys-2026-08-28/c1-geocode-source-roundtrip/.

**Decide, or do:**
- **Apply 20260905000003 to production.** RESERVED for you under Law 10. It converts
  events.venue_geocode_source to the enum after checking that no row holds another value
  (production has 4 rows, all null). Until you do, the types-drift guard on main reports
  "MIGRATIONS PENDING" by name and passes; after you do, it reports in sync. One command after
  linking to gndnldyfudbytbboxesk and reading the ref back: `supabase db push --linked`, then
  `node scripts/ops/verify-production-schema.mjs`.
- **Disk, 5.07 GB free.** The one large thing I could not touch: Logitech Options+ keeps
  nine full update payloads in C:\ProgramData\LogiOptionsPlus\depots (7.1 GB, August 2025 to
  April 2026). Deleting all but the newest two needs an admin PowerShell:
  `Get-ChildItem C:\ProgramData\LogiOptionsPlus\depots -Directory | Sort-Object LastWriteTime | Select-Object -SkipLast 2 | Remove-Item -Recurse -Force`.
  Downloads (15.4 GB), Desktop (8.7 GB), Music (18.7 GB) and OneDrive (41.8 GB) are yours and I
  did not touch them. A Next build needs 5 GB free to start, and every build now lands within
  a few hundred megabytes of that line.
- **B2 was never closed on paper.** The session that built it wrote no ledger rows and no entry
  here, and its log ends with the third drive running. The code merged in PR #124. I have
  recorded the gap in the ledger rather than write verdicts for work I did not see.

**Closed 6 September 2026:** PR #125 merged as 4587489f, every run on main is green (CI,
post-deploy smoke, env locks), and the live site serves that commit. Nothing further for you on
C1 except the migration above, which stays yours.

## C2 (6 September 2026): a push cannot leave this machine until every CI check has passed here

**What changed for a real user:** nothing on the site. This item is about how work reaches the
site: the six failed-run emails you got for one pull request cannot happen again, because CI is
no longer the first place anything is checked.

**What changed for you and for anyone pushing:** `git push` now runs the whole gate first, as one
command (`npm run gate:push`): the typecheck, lint, the copy laws, the critical-path guard, the
exemption clock, all 65 build guards, the types-drift check against production, the full test
suite, a production build, and the Lighthouse mobile gate on that build served locally with the
same Lighthouse version and the same floors as CI. If any step is red, nothing is pushed and the
output names the step and the one command to re-run it. Pull requests are now opened as drafts;
CI stays silent on a draft and runs exactly once when the pull request is marked ready. Two new
build guards make sure neither half of that can quietly disappear.

**Two things found and fixed on the way:**
- The reason `.env.local` had to be moved out of the way around every push was a fault in the
  production-write safety check itself: the file's "preview" project name could re-point a script
  that was aimed at production to "TEST, proceeding". Fixed and pinned. The suite now passes with
  the file in place, so that manual step is gone.
- Production's pages being indexable by Google was checked by nothing. The gate's local run now
  asserts it before every push, using the same robots header production serves.

**Evidence:** C:\dev\EVIDENCE\C2\ (the gate blocking on a planted type error, the two full push
runs, the Lighthouse hand run with all 13 pages and their scores, the guard proofs red and green,
the drills, the suite with `.env.local` present).

**Decide, or know:**
- **A push now takes about half an hour**, most of it the build (about 3 minutes) and Lighthouse
  (about 16 minutes for 13 pages, three runs each). That is the cost of the rule you set on
  5 September; it is measured, not estimated, and it is the same measurement CI takes. If you
  want it cheaper, the honest levers are fewer runs or fewer pages, and both are threshold changes
  I have not made.
- **The "park .env.local around every push" law in BUILD-BRIEF.md is obsolete** on the code
  side, for the reason above. Nothing in the repository still needs it.

**Closed 6 September 2026:** the push went through the gate (12 of 12, about 30 minutes), PR
#126 was opened as a draft (every workflow recorded as skipped, nothing ran), marked ready (CI
ran once and passed), squash-merged as 9f530a4d, and production serves it with the post-deploy
smoke green. One thing to know: the advisory Lighthouse run on the pull request failed on the
Vercel preview by 13 milliseconds of LCP on one event page, the runner gap your 25 August ruling
describes; the same page passed on the local build inside the gate. It emailed you; it is not a
regression in the product and nothing was relaxed.

## C3 (6 September 2026): the picture every shared link shows was dead on a real server, and the navy wash on every card had never existed

**The item you set:** prove the eighteen social cards from a running server, three formats
across six channels, each a real image at its published size with actual ink, plus a contact
sheet and a per-event card driven against a real event page.

**Done, and here is the number:** 32 of 32 checks passed at 1440, 768 and 390, with zero
server errors and zero blockers, as a real organiser who signed up on the form, made their
organisation, uploaded a real photograph and published a free event through the wizard. All
eighteen cards download, decode at their published sizes and carry ink. The poster's QR was
pulled back out of the PDF and scanned with a real scanner, and it points at the right
address. All fourteen tracked share links resolve.

**But the item found something much worse, and that is the real story.**

**Every shared event link was serving nothing on a real server.** Not a broken picture, which
you would see. The connection was dropped mid-answer: no status code, no image, no error a
person could read. It happened on every single request, every time, on both the event card and
the artist card.

**Why:** the library Next gives you for drawing these images hands the finished artwork to a
photo tool that cannot read it inside a running server. That is the identical fault that killed
all eighteen Launch Kit cards on 29 August. It came back nine days later because the fix was
applied to the cards somebody was looking at, and the share cards were left on the old library,
because nobody had ever driven one. All nine image routes are now on the platform's own
renderer, and a build guard fails if the old library ever comes back anywhere.

**Your live site was not affected, and I proved that rather than assumed it:** I called
production six times, forcing a real render each time and landing on four different machines,
and every one returned a good card. It works there by luck: the photo tool that breaks it is
not installed in that particular slot. That is exactly the fragility the 29 August ruling
exists to remove, so it is now removed.

**The second thing I found is the one you will actually see.** Every share card and every
Launch Kit card is designed with a navy wash rising from the bottom, so white type stays
readable over whatever photograph the organiser uploads. **That wash has never once drawn.** Not
on your live site, not anywhere, for as long as the cards have existed. The drawing engine
silently ignores the one shorthand the code used to position it, so the layer collapsed to
nothing and no error was ever raised. Look at C:\dev\EVIDENCE\C3\prod-og-card.png, which is
your live card today: the title and "Tickets at www.eventlinqs.com.au" are sitting straight on
a bright photo and the last line is barely readable. Then look at
C:\dev\EVIDENCE\C3\og-root-cause\scrim-event-card.png, which is the same card now. All ten
places were fixed and a guard stops it returning.

**The third thing:** those cards were drawing in a default system typeface rather than
EventLinqs' own. Your own code calls that "the single loudest 'made by a template' signal on an
artefact a promoter puts in front of their audience". They now use the real brand fonts, the
same ones the Launch Kit cards already used.

**Two more, quieter, both fixed:** a guard was blind to three of your icon files, including the
Android one, and the proof itself could only ever be run once, because it reused the same
signup email and event name every time.

**Evidence:** C:\dev\EVIDENCE\C3\ - the three viewport folders with all eighteen cards and the
contact sheets, and og-root-cause\ with the failure captured before, the same routes working
after, and the guard proven both failing and passing.

**One thing for you to decide, and I have not touched it:**

- **A script that deletes events from your PRODUCTION database was sitting loose in the repo.**
  `scripts/ops/purge-test-events.mjs`, never committed to git, referenced by nothing, reading
  your production service key from a plain text file. Every other tool in the repo refuses to
  run against production; this one refuses unless it IS production. It was also stopping the
  build. I moved it, unchanged, to `C:\dev\quarantine\` with a note listing three options
  (delete it, adopt it properly with a confirmation step, or keep it as a personal tool outside
  the repo). It is your call and nothing was lost.

**Also worth knowing: disk.** I started at 6.17 GB free, below the 8 GB floor you set. I
reclaimed what I could reach and reported the rest; it now sits above 20 GB. The one thing I
still cannot touch is 7.3 GB of old Logitech update payloads in
`C:\ProgramData\LogiOptionsPlus\depots`, which needs an admin PowerShell:
`Get-ChildItem C:\ProgramData\LogiOptionsPlus\depots -Directory | Sort-Object LastWriteTime | Select-Object -SkipLast 2 | Remove-Item -Recurse -Force`

**Closed 6 September 2026:** the push went through the gate, PR #127 was opened as a draft,
marked ready once (CI, tests, the types check and the advisory Lighthouse run all green),
squash-merged as b4255a96, and your live site serves it: both post-deploy smoke runs passed and
the served page carries that release. Every shared link on production now draws its card
through the platform's own renderer, with the navy wash and the brand fonts.

## C13 (6 September 2026): an organiser can now archive, restore and delete an event, and a cancelled event is no longer a dead end

**The item you set:** you found on production that the events list offered no delete and no
archive, and that a cancelled event could only be edited, viewed or duplicated for ever.

**What a real organiser can do now, driven at 1440, 768 and 390, 42 of 42 checks at each:**
- **Archive** any event from the list or its overview. It leaves every public page, search, the
  city pages and the sitemap at once, sales stop, and every record stays. It sits under a new
  Archived tab with Restore, which puts it back exactly as it was (a cancelled event comes back
  cancelled; a live one comes back live, after the same checks publishing runs).
- **Delete** an event that has never had an order, a ticket, a squad purchase, a discount
  redemption or a refund. A free ticket counts, as Humanitix treats it. The organiser types the
  event's name; the dialog says permanent, no undo. The event, its tiers, codes, lineup, seats and
  artwork go, and its address answers "gone" (410) from then on with a branded page.
- **A cancelled event keeps Archive**, so nothing is stuck in the list any more.
- **Nobody with a ticket loses anything.** I drove a guest who took a free ticket, then archived
  the event: the ticket is still in their wallet with a note, the bearer page opens, the scanner
  admits it, and the event page still opens for them (and only them; a stranger gets 404).

**The database decides, not the buttons.** Deleting an event with an order is refused by a
trigger that fires for every role, the admin console included. I proved it by asking the
database directly with the highest credential and watching it refuse, naming the records.

**Four things I found underneath, all fixed in the same change:**
- The checkout never asked whether an event was still published. A paused or cancelled event
  could be reserved through the server action while the page merely hid the panel. It now
  refuses anything that is not live.
- Every event that had ever opened its Launch Kit was undeletable: a constraint added on
  15 August contradicted the share-link rule of 8 August, and nothing tested the two together.
- The old draft-only delete had been broken for every organiser since the column lockdown of
  8 August (a permission error nobody had driven).
- The event page's own layout answered 404 before the ticket-holder check could run.

**Admin parity.** /admin/events has archive and restore on every row and a typed delete on
the event page, under the same database rule, with no override. Every archive, restore and
delete writes an audit row (who, what, when, from where, the state at the time) that shows in
the audit log.

**Evidence:** C:\dev\EVIDENCE\C13\ (the three viewport folders with numbered screenshots and
results.json, db-proof\results.json with 19 of 19, the guard proofs red and green, the drills
at 87 of 87, five builds, the drive logs).

**Decide, or know:**
- **Two migrations are yours to apply to production**, as ever: in PowerShell, linked to
  production, `npx supabase db push --linked`, then `node scripts/ops/verify-production-schema.mjs`.
  Until you do, the production build is refused by the schema guard on purpose and the current
  deployment keeps serving.
- **This session's terminal came with your PRODUCTION environment loaded** (VERCEL_ENV set to
  production, the live Stripe publishable key, the production Supabase address), injected by the
  Vercel plugin when the session started. Nothing was written to production: every write script
  refuses it by project ref. But it made every database guard report production, blocked the first
  build, and failed two tests until I scrubbed it for every command. Whether that plugin should
  load production values into a development shell at all is your call.
- **Not built, deliberately:** bulk archive or bulk delete, per the close-out.

**Closed on the code side, 6 September 2026, 18:45:** three pushes through the gate, PR #128
merged as b7798b76. One more thing was found on your Vercel preview and fixed before merging: a
ticket holder opening an archived event was being served the stranger's cached "not found" page
by the edge cache, because the edge serves a cached page by address to anyone. It now sends a
signed-in viewer to the same page by an address the cache never keeps, and I drove it on the
preview with a real login: the holder sees the page every time, the stranger never does.

**Production is waiting on you, and only you (two commands, then one to rebuild):** the build
refuses itself on production until the two migrations are there, which is the schema guard doing
its job, so your live site still serves the previous release. In PowerShell, from the repo:
`supabase link --project-ref gndnldyfudbytbboxesk`, read the ref back, `supabase db push --linked`,
`node scripts/ops/verify-production-schema.mjs`, then
`npx vercel redeploy https://eventlinqs-n8zbkb8e2-lawals-projects-c20c0be8.vercel.app --target=production`,
and relink to TEST with `supabase link --project-ref vkapkibzokmfaxqogypq`. Until then CI on main
shows red for that one reason. Next time an item carries a migration the code depends on, I will
hand you the migration before merging so main never sits red.

## C14 design uplift, the five screens (6 September 2026): measured, landed, and stopped where you said to stop

**What you asked for (C14.9):** the five screens a venue judges you on, in order, each one changed only where a
measurement says the change is better and worse on nothing, then stop and show you. That is what happened. Nothing
beyond those five screens was touched, and the remaining routes wait for you.

**What a venue or a ticket buyer sees now, and did not before:**
- **Every word on the platform is in the brand face.** Body copy had been falling back to the visitor's system
  font since the Archivo pass landed, because the body token pointed at a variable that lived one element too
  low. Nobody saw it because it looked "fine"; measured, it was a third or fourth family on every page.
- **One type scale, six sizes, everywhere.** The homepage rendered twelve sizes; the event page nine; the dashboard
  six with an 11px and a 20px that nothing else used. Every screen is now on 12, 14, 16, 18, the section step
  and the display step, and nothing else.
- **Three corner radii and one shadow family**, where there had been up to nine radii and ten shadows on one page.
  The browse card and the homepage card are finally the same card.
- **Every control is at least 44 pixels tall**, including every header link, every footer link, every row action
  on your events list (which were 16px text links), the seat selector's steppers and the buttons on the empty
  states. Every one shows a focus ring. Keyboard focus no longer snaps a rounded button to square corners (a
  global rule had been doing that on every screen).
- **Body copy holds 51 to 68 characters a line** at every width; the footer and the event page ran to 103.
- **Checkout puts the trust panel where the money is**: under the order total beside the form, and directly under
  the Pay button on the payment step, on every width. It used to be a third column at the far right on desktop
  and below everything on a phone.
- **The dashboard passes axe** (an unnamed progress bar and a gold link that failed contrast are fixed).
- **The empty states are designed**: a city with no events, a search with no results, and a fresh organiser's
  dashboard and events list each read as a next action, at 44px, on the same scale.

**Measured, not claimed.** One harness measured the old build and the new one identically at 390, 768 and 1440,
light and dark, on a production build against the test database: 173 rubric lines better, 16 "worse", and every
one of the 16 is a 1 KB script rounding beside a 6 KB stylesheet saving on the same page, or Google's map loading
a moment earlier on one phone view. Lighthouse is level or better on every route: the homepage 77 to 81 on mobile,
checkout 87 to 90, the dashboard 88 to 89, the events list 89 to 91, browse 87 to 89, desktop unchanged at 95 to
100. Nothing came down.

**Before and after, the images to look at:** C:\dev\EVIDENCE\C14\before2\ (as it was) against
C:\dev\EVIDENCE\C14\after\ (as it is), same file names: fixture\home-1440-light.jpg and home-390-light.jpg,
natural\browse-1440-light.jpg, fixture\detail-1440-light.jpg and detail-390-light.jpg,
natural-authed\checkout-1440-light.jpg, natural-authed-org\dashboard-1440-light.jpg and
dashevents-1440-light.jpg. The empty states are in after\natural-empty\ and after\natural-authed-empty\.

**Two things found underneath, fixed in the same change:**
- A global focus rule set a 4px corner on every focused element, overriding pills, cards and dialogs the moment
  they took keyboard focus, on every screen.
- The "65-character" prose width was holding 90 characters in Manrope, because that unit is the width of a zero
  and Manrope's zero is wide. One utility, derived from the measured glyph width, now holds it at about 72.

**Decide, or know:**
- **The body typeface.** The constitution names Hanken Grotesk as the body face; it never rendered. Your rubric
  allows two families, so the platform now renders Archivo and Manrope. If you want Hanken instead, it is one
  token and one import, and I will re-measure. Until you rule, the constitution line and the code disagree.
- **C14.1 to C14.8 are not on disk.** The close-out carries C14.9 to C14.16 and cites "the field Web Vitals
  budgets from C14.5"; nothing invented for them. Point me at them if they exist.
- **Checkout loads 3.7 MB of Stripe before the buyer reaches payment.** Loading it on "Continue to payment" is a
  one-line change on the money path; yours to call.
- **Still yours from C13:** the two production migrations and the redeploy; main stays red on preview-state
  until then.

## C4, C5, C6 and C7 (6 September 2026): four production checks, nothing broken, one decision restated

**What a visitor gets on the live site, driven today, read only:**
- **The Arts tile** on the homepage draws (every image size the browser can ask for answers with a real picture) and lands on a working page. Nothing was missing, so nothing was copied.
- **Every community page and every faith page**, 26 of 26, answers with its own heading and no placeholder.
- **Every route the code declares** (189 pages and handlers, 209 requests with real slugs from your own sitemap) answers correctly: nothing crashes, nothing is a dead page. The seven addresses that answer "not found" are meant to: three sit behind feature flags that are off on production (artists, the artist dashboard, the gig board) and four are design previews gated off production.
- **The old integration/launch branch is gone** locally and on GitHub.

**One thing I could not drive on production:** the 52 addresses that belong to a signed-in person (your dashboard pages, orders, tickets, squads, launch codes). Anonymously they answer the right thing (sign in, not found, or a designed "this link has expired" page). Driving them with a real id on production means creating an account on production, which is a write, so I did not. They were driven signed in on the local production build against the test database in C13 and C14.

**Restated, because it matters more than the four items:** the live site publishes two events. Every rail on the homepage is invitation cards and /events lists nothing. The engineering is right; the catalogue is a supply decision, yours: recruit, or approve seeding production.

**Evidence:** C:\dev\EVIDENCE\C4\, C5-branch-hygiene.txt, C6\community-faith-production-2.txt, C7\sweep-production.txt.

**Closed on the code side, 6 September 2026, 22:05:** the push went through the gate green (12 of 12), PR #129 was opened as a draft, marked ready once, CI green on all three jobs, squash-merged as 2d558d2a. Your live site still serves the release before C13 until you apply the two C13 migrations (the commands are in the C13 entry above); C14 rides the same redeploy.
