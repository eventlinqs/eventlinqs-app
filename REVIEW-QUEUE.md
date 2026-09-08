# REVIEW QUEUE FOR LAWAL

One entry per finished item: what a real user can now do, where the evidence is, and
anything you must decide. Newest last. Plain language.

## Needs you (open decisions and credentials)

UPDATE 7 September 2026 at 21:00 (session 40): C16 closed (12:41), C8 merged (13:33), C8 CORRECTED merged (15:40), C17 done in two merges (17:07, 17:59), C9 merged (19:00), and C18 FINAL merged at 20:55 (PR 136, 15ccce5c): production is Ready on it and serving it. The community layer is now written into the scope as approved, with an addendum you can read, a machine-readable record, and a guard that refuses to let any of it be lost; nothing was removed and no slug was touched. Next: C19, then C10 and C15. Items for you: the launcher (first below), the 95 decision (the C8 CORRECTED entry), the two C17 questions, the Google Maps key, and two C18 decisions (Pride as a community page; the legacy communities table), neither urgent.

The block history (sessions 3 to 39: the same three migrations behind, re-verified on every relaunch, your one command made safe and checked against production read only) is in BUILD-LOG.md and BUILD-LEDGER.md; it is finished and is not repeated here.

Rewritten 7 September 2026 at 01:10. Everything below the first item is unchanged in
substance; what was already done (the A2, A3, A4, B1 and B2 migrations are on production,
disk is at 22 GB, the Vercel token is no longer needed) has been removed so the one thing
that is blocking is the first thing you read.

- **FIRST. Your launcher deleted the build and the tool cache under a running push gate, twice today. A corrected copy is ready; switching to it is one step.** C:\dev\RUN-BUILD13.ps1 cleans the disk every time a session ends, and one of the things it deletes is the folder where npx keeps the Supabase CLI and Lighthouse. At 11:27 that broke the types-drift step (the CLI had been deleted and came back without its Windows binary). At 11:46 it ran again while the previous session's push gate was still auditing in the background (the harness had ended that session after waiting ten minutes for the gate), deleted the build the gate was serving and the Lighthouse binary it was running, and the gate failed on /organisers with "module not found" and then hung. Each gate run is 25 minutes. Nothing about the product was wrong; the third run passed 13 of 13. The fix is two lines and I have NOT edited your file: C:\dev\RUN-BUILD14.ps1 is RUN-BUILD13 plus (1) the harness told to wait for background work indefinitely instead of ten minutes, and (2) the clean-up refusing to run while a push gate or a git push is alive (it waits up to 45 minutes). When you next start the watchdog, start RUN-BUILD14.ps1 instead of 13. Evidence: C:\dev\EVIDENCE\C16\gate-orphaned-by-reclaim-session40.txt, gate-pass-on-push-session39b.txt (the refusal), C:\dev\WATCHDOG.log 11:19 to 11:47.
- **Two small gate defects found on the way, not yet fixed, going into the next push (PR 130).** (a) When the Lighthouse step fails, the gate does not always stop the local server it started, and then waits on it for ever instead of returning the verdict to git. (b) When the Supabase CLI cannot start at all, the types-drift report says "run npx supabase login", which sends you to the wrong place. Both are recorded in the ledger with the shape of the fix. Nothing for you to do.
- **Production catalogue.** The live site has four event pages, two of them payment test
  artefacts. Every city, community and category page resolves but shows almost nothing. The
  only national seeder refuses a production target by design, and this brief makes production
  read only for me. Options, from C:\dev\PRODUCTION-STEPS.md: seed production deliberately
  (needs a decision and a new guarded path), launch thin and let the invitation cards carry the
  rails, or delay go-to-market until real organisers list. Your call.
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
  and Google answers OK. C9 (the code side: required on production, forbidden on development,
  loud failure) is queued behind the halt rule.
- **The Sentry decision from C8.** The error-reporting SDK boots on `load`, inside the
  simulated LCP window; with it out of that window the same event page scores 92 against 74.
  Your 25 August ruling says not to move it to idle. The narrower proposal is "after load AND
  after the first big paint". Say yes and it is one change and a re-measure. Detail in the C8
  entry below.
- **A Stripe test secret for the local server (your `stripe login`, or nothing).** Since
  2 September no local drive can pay: Vercel will not hand a sensitive value back, and both keys
  the Stripe CLI stores expired in July. A4's two buyers therefore paid on the Vercel preview of
  the branch, which is a real deployed surface holding the test secret and reading TEST, and the
  organiser and the stranger ran locally; the evidence names the origin on every buyer line. If
  you want every leg on one origin, run `stripe login` once on this machine and
  `node scripts/ops/after-stripe-login.mjs` proves it. Nothing waits on this.
- **A hole in no-plaintext-credential, its own small item.** The guard's regex needs at
  least one character before the credential word, so its own headline case
  `const PASSWORD = '...'` is not caught, while `const NEW_PASSWORD = '...'` is. Widening it
  catches 20 sites today: journeys 1, 2 and 8, two break-attempt scripts, three sweep scripts,
  six verify scripts and four unit-test fixtures, every one a per-run minted value or a fixture,
  none a real credential. The fix is one regex character plus twenty one-line edits to mint at
  runtime and a drill test; about an hour. Decide when it goes.
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

## C16 (7 September 2026): why main went red twice, what now stops it, and the one step that is yours

**What actually failed, from the logs.** Both production builds (the C13 merge at 08:37 and the C14 merge at 11:53 UTC on 6 September) were stopped by two of your own guards: the database behind production does not carry the two C13 migrations, so the build that names those tables refused to ship rather than break the organiser events list and the event page on the live site. CI on main then went red for one reason only: a guard that looks at the newest deployment of the branch being built saw main's deployment in ERROR. The Lighthouse failures on the C13 pull request were two event pages scoring 0.77 and 0.75 against a 0.8 floor on the runner.

**Why the pull request was green and main was red, in one sentence.** A pull request builds against the TEST database, where every migration is applied; main builds against production, where applying a migration is your reserved step and had not happened; and nothing on a pull request asked whether production carries what the code needs. That is exactly the class you named.

**What now stops it.**
- A production-parity check asks production, before a push and before a merge, whether it carries every migration in the tree and whether its environment satisfies the manifest. It runs inside the pre-push gate on this machine and as a required check on every pull request.
- Branch protection on main now requires that check alongside the build and the tests, holds administrators to it, requires a pull request, and the ruleset's admin bypass is gone. A guard reads that back on every build.
- Driven: the C8 pull request, ready and green, cannot be merged now ("the base branch policy prohibits the merge"). And the very branch carrying this fix is refused by the gate on this machine, because production is behind the tree, which is the condition that produced both red merges. The gate now refuses it before anything leaves the machine.

**The one step that is yours, and everything waits on it.** Production is behind the tree by three migrations, not two: the C1 enum from 5 September as well as the two C13 files. Until you apply them, no branch can pass the parity check, main cannot deploy, and this fix cannot be pushed. In PowerShell, from the repo:
```
supabase link --project-ref gndnldyfudbytbboxesk
Get-Content supabase\.temp\project-ref
supabase db push --linked
node scripts/ops/verify-production-schema.mjs
supabase link --project-ref vkapkibzokmfaxqogypq
```
then redeploy the newest main build from Vercel. After that I push this branch, its pull request runs the parity check green, it merges, and I watch production to Ready and drive the live routes (C16.4). From then on a merge is not finished until production serves it, as you ruled.

**One more thing yours to mint:** a Vercel token with read access, kept in .env.local as VERCEL_TOKEN, makes the environment half of the parity check real on this machine too. Without it the gate says so in capitals and the required CI job carries that half.

**C2 is reopened** as you said and closes only when a merge reports parity green and deploys Ready.

**Evidence:** C:\dev\EVIDENCE\C16\ (the parity refusal, the before and after protection, the refused merge, the guard red and green, the refused push).

## C8 mobile Lighthouse (6 and 7 September 2026): the shell is fixed, 95 is not reached, and the rest is yours to decide

**What the measurement said first.** From this machine, your live site scores 68 on the homepage, 75 on browse and 68 on an event page on mobile (desktop 96 to 99). Not the 93 on record. The pages are quick to a real phone (the largest image is on screen in about a second); what Lighthouse scores is a simulated slow 4G phone, and on that profile nothing painted for four seconds because the page's own head asked for nine images, seven font files and 400 KB of script at the same moment as the stylesheet it needs before it can draw anything.

**What is fixed, platform-wide, on every page:**
- A page now preloads one image, the one that matters (the hero, or the first tile under it), instead of up to ten. A guard refuses any new preload that nobody has named.
- The two typefaces are one file each instead of seven. This also repairs something C14 caused without anyone seeing it: body text had been rendering semibold since that merge, because the body face only shipped its heavier weights.
- Long pages no longer lay out every rail before they paint; sections below the fold wait until they are near.

**Measured on Vercel, the old build against the new one, same day, same machine:** homepage 71 to 88, browse 74 to 76, the event page 68 to 74. Locally the homepage went 81 to 88. Nothing came down. An inlined stylesheet was also tried and made every page worse, so it is not in.

**Why it is not 95, in plain terms:**
- **The error-reporting SDK.** It loads the moment the page fires "load", which on a fast connection is a fraction of a second BEFORE the biggest image has painted, so Lighthouse charges its 218 KB against the page. With those two files kept out of that window, the same event page on the same preview scores 92 instead of 74. Your ruling of 25 August says not to move it later. Moving it to "after load and after that first big paint" would cost Session Replay roughly a fifth of a second of the earliest moments of a page and nothing else; every error is still captured. **This is your call.** Say yes and it is one change and a re-measure.
- **Server time at full density.** With a full catalogue (the preview), the homepage and browse pages take one to two seconds to stream their content from the database before anything can paint. That is data and rendering, not the shell, and your live site with two events does not have it (35 ms). It becomes real the day the catalogue does, and it is a caching decision for those two pages.
- **The live site cannot be re-measured** until the C13 migrations are applied and the site redeploys; this change rides that deploy. The command to re-take the number is in the ledger.

**Evidence:** C:\dev\EVIDENCE\C8\ (the production baseline, the phase diagnoses, four local iterations, the champion-against-challenger preview runs, the Sentry-blocked runs, the guard proofs).

## C16, continued (7 September 2026, 01:15): nothing has moved, your step is now one command, and two small things were found and fixed

**Where things stand.** Exactly where the last entry left them: production still serves the C3 build, the two production deployments after it still failed, main is still red, and production is still three migrations behind the tree. Nothing new has been started, by your halt rule. This session checked all of that against the live systems before doing anything.

**What changed for you.** The five commands and the dashboard redeploy are gone. Your step is now:
```
npm run migrate:production
```
It shows you the three files from production's own record, asks you to type the production ref, hands you the CLI's own prompts for the push, proves the result two ways, and leaves the CLI linked to TEST whatever happens. It was driven tonight in both the paths that refuse (a dry run, and a wrong confirmation); the path that applies is yours. The redeploy is not a separate step any more: merging the C16 branch redeploys production, and I watch it to Ready. The full text is at the top of this file under "Needs you".

**Two things found underneath, both fixed and tested:**
- The gate's production-parity check had been skipping its environment half on this machine "for want of a Vercel token", and I had told you minting one was a step only you could do. That was wrong: the Vercel CLI on this machine has been logged in as your account since 3 September, and its login is enough. The check now reads that login (never printing it) and judged the production store for real tonight: 34 records, every required one present, nothing forbidden held. You do not need to mint anything.
- A build guard wrongly refused the new script for using a Node feature "Node 24 does not provide" (it does; the guard's list of what Node provides was missing everything a global inherits). Fixed at the source, the list regenerated, a test pins it.

**Also acknowledged.** C17 (the empty homepage hero) and C18 (the community taxonomy against the scope) were added to CLOSE-OUT.md at midnight; both are in the ledger as not started, because of the halt rule, and are next in that order after C16 closes.

**Evidence:** C:\dev\EVIDENCE\C16\ (production-parity-recheck-session3.txt, migrate-production-dry-run.txt, migrate-production-refused.txt, production-parity-env-half-real.txt, guards-session3.txt and guards-session3-after.txt, suite-session3.txt, gate-refused-on-push-session3.txt).

## C16, continued (7 September 2026, 01:58): one more thing that would have made main go red again after your migration, found and fixed

**Where things stand.** Unchanged: production still serves the C3 build, the two later
production deployments are still failed, main is still red, and production is still three
migrations behind the tree. Your one command is still the only thing that unblocks it:
```
npm run migrate:production
```

**What was found.** The check that reads Vercel's build state during CI was reading the
wrong build. A successful Vercel build of this site lands about two and a half minutes after
a push, and CI reaches that check about two minutes in, so the check had been looking at the
PREVIOUS commit's build every time. Every green run on main since 5 September passed on the
commit before it. After your migration, the first merge would have been judged by the two
failed builds that are still on record, main would have gone red one more time, and you
would have received one more failed-run email for a commit that was in fact fine.

**What is fixed.** The check now waits for the commit's own build, up to ten minutes, and
judges that one. It was driven against the real records: it fails on the commit whose build
failed, passes on the one whose build succeeded, and does not wait on this machine for a
build that cannot exist yet. Eighteen tests pin it, the whole guard drill set was re-run
alone and passed, 92 of 92 drills fired correctly and all 71 guards green on the restored tree, and every other check is green on the tree.

**Nothing changes for you.** The command above is the step; after it, the sequence in the
"Needs you" item at the top runs without you.

**Evidence:** C:\dev\EVIDENCE\C16\ (guard-preview-state-driven-both-ways.txt,
probe-deployments-by-sha.txt, guard-failure-drills-session5.txt, guards-session5.txt,
suite-session5.txt, canary-session5.txt, production-parity-recheck-session5.txt).

## C16, continued (7 September 2026, 02:30): nothing has moved, and the last proof the close-out asked for on the gate is done

**Where things stand.** Unchanged: production still serves the C3 build, the two later
production deployments are still failed, main is still red, and production is still three
migrations behind the tree. Your one command is still the only thing that unblocks it:
```
npm run migrate:production
```

**What was finished.** The close-out asked to watch the push gate refuse a push when a
production-only environment value is broken. Breaking one on Vercel would break the live site,
so the fault was planted on the other side of the comparison: the checklist the gate judges the
real store against. A throwaway branch carrying that fault was pushed for real; the gate ran
eight checks green, then refused at the parity step naming the record, and nothing reached
GitHub. The throwaway branch is deleted. The two matching drills the previous session added are
now proven in the drill harness, which fired 94 of 94 and left every guard green. No code
changed.

**One thing I got wrong and corrected.** The first push attempt was refused two steps early,
because I ran it without the wrapper that strips this shell's production variables, and four
database checks answered against production with the test key. That is a known fault of this
machine's shell, recorded on 6 September, not of the gate. The second attempt, through the
wrapper, is the one the evidence cites.

**Nothing changes for you.** The command above is the step; after it, the sequence in the
"Needs you" item at the top runs without you.

**Evidence:** C:\dev\EVIDENCE\C16\ (gate-refused-on-push-env-fault.txt,
guard-failure-drills-session7.txt, production-parity-recheck-session7.txt,
deployments-recheck-session7.txt).

## C16, continued (7 September 2026, 03:25): your one command would have hung after you typed y; found and fixed before you pressed it

**Where things stand.** Unchanged: production still serves the C3 build, the two later
production deployments are still failed, main is still red, and production is still three
migrations behind the tree. Your one command is still the only thing that unblocks it, and it
is the same command:
```
npm run migrate:production
```

**What was found.** The command had only ever been tested on the paths where it refuses. The
path that continues, where it asks you to type the production ref and then hands the terminal
to the Supabase CLI for its own questions, had never been driven, because the real thing writes
to production. Tonight it was driven on a simulated terminal against the test project, with a
stand-in for the CLI's question. After you typed the ref, the next question would have shown
your keystrokes but never accepted the Enter: the CLI's "push these migrations? Y/n" would have
sat there for ever after you typed y, and you would have had to press Ctrl-C. The cause is a
quirk of how Node hands a terminal over after asking a question; the fix is to ask the question
a different way, one that leaves the terminal clean.

**What is fixed.** The confirmation is now read in that clean way. Driven again the same way with
the real code: the stand-in question received its answer and finished, and the real CLI took the
terminal and linked to the test project without trouble. The three refusing paths still refuse.
Four tests pin it, all other checks are green on the tree, and the push gate holds the commit at
production parity as before. Nothing else changed: the parity gate, the CI job and the branch
protection are as they were.

**Nothing changes for you.** The command above is the step. After it, the sequence in the
"Needs you" item at the top runs without you.

**Evidence:** C:\dev\EVIDENCE\C16\ (conpty-real-askline-cmd-child-through-wrapper.txt,
conpty-real-askline-supabase-link-TEST.txt, conpty-diag-handle-reading.txt,
conpty-drive-4-through-wrapper.txt, migrate-production-refused-after-fix.txt,
migrate-production-dry-run-after-fix.txt, suite-session12.txt, guards-session12.txt,
gate-refused-on-push-session12.txt, production-parity-recheck-session12.txt).

## C16, continued (7 September 2026, 04:20): nothing has moved; your one command checked against production's own data, read only, and it will run clean

**Where things stand.** Unchanged: production still serves the C3 build, the two later
production deployments are still failed, main is still red, and production is still three
migrations behind the tree. Your one command is still the only thing that unblocks it:
```
npm run migrate:production
```

**What was done.** Until tonight nobody had asked production itself whether the three files would
run to the end on it. Each file assumes things about what is already there: that no event carries
an unexpected geocode source, that no share link is in a shape the new rule refuses, and that every
column, function and constraint the files name exists under the name they expect. Each assumption
was checked by reading production, never writing to it, and every one holds. Both databases run the
same Postgres version. How the tool applies the files was read from its own source code rather than
assumed: each file is committed before the next starts, which is exactly what the second file relies
on. One of the three files runs in three parts rather than one, but every step in it can be repeated
safely, so if anything stopped partway the same command would finish it.

**Nothing changes for you.** The command above is the step; after it, the sequence in the
"Needs you" item at the top runs without you.

**Evidence:** C:\dev\EVIDENCE\C16\ (migration-preconditions-production-session19.txt,
probe-migration-preconditions.mjs, production-parity-recheck-session19.txt,
deployments-recheck-session19.txt).


## C16 closed (7 September 2026, 12:41): main is green, production serves the fix, and what your launcher did to two gate runs

**What is true now.** You ran `npm run migrate:production` at 11:20 and production carries every migration. The C16 branch then went through the full local gate (typecheck, lint, copy laws, 71 guards, types-drift, production parity, the suite, the build, Lighthouse on 13 pages) and passed 13 of 13. Its pull request (131) opened as a draft, was marked ready, and its three required checks passed, including the new "production parity" check that did not exist before this item. It merged as 1e3b9b2f at 12:33. The production deployment for that commit reached Ready at 12:36, www.eventlinqs.com.au serves it (the page carries the commit id), the apex redirects to www as before, the post-deploy smoke passed twice, and CI on main is green on the merge commit: the first green on main since 5 September. So C13 (archive and delete) and C14 (the five screens) are finally live on production as well; they had been sitting behind the two failed deployments since yesterday morning.

**Proof you can check.** Every route enumerated from the code was driven on production again (210 requests): the homepage, browse, three city pages, three suburb pages, three community pages, three community-by-city pages, three faith pages, a category page, two event pages, organisers, pricing, checkout. All 200. No server error, no broken page inside a 200, no soft 404. The only 404s are the same seven as yesterday and all deliberate (three features switched off on production, four developer previews gated off production).

**What the launcher did.** Two 25-minute gate runs were lost today to C:\dev\RUN-BUILD13.ps1, not to the product: it deletes the tool cache and the build every time a session ends, and it did so once while a gate was still running. The details and the corrected copy (RUN-BUILD14.ps1) are in the first "Needs you" item at the top of this file.

**One advisory red you will see.** The Lighthouse CI workflow on pull request 131 failed on the runner on three pages (the homepage 0.75, two event pages 0.77, floor 0.8). It is advisory by your 25 August ruling, it is not one of the required checks, and this branch changes no page at all, so it measured main as it stood. The C8 shell fix in PR 130 is what moves those numbers (it passed the same workflow on the same runner on 6 September) and it merges next.

**Evidence:** C:\dev\EVIDENCE\C16\production-healthy-session40.txt, gate-pass-on-push-session40.txt, gate-orphaned-by-reclaim-session40.txt, sweep\sweep-production.txt, pr-body-c16.md, merge-body-c16.md.


## C8 merged (7 September 2026, 13:33): the shell fix is live, the honest production numbers, and why they are lower than Friday's

**What is live.** PR 130 merged as cdf34aaa at 13:33 after the same discipline as C16: the full local gate (13 of 13), CI once, production watched to Ready (13:36), the page carries the commit id, the smoke passed twice, CI on main green. The head of every page now preloads one image instead of nine, both type families ship as one variable file each, and rail sections defer their layout until they approach the screen. Two small defects in the push gate found this morning went in with it: a refused push can no longer hang on its own server, and the types-drift check now says "the tool cannot start, repair the cache" instead of "log in" when that is what happened.

**The numbers, and what they mean.** Your standing instruction was to re-take the production score with the same script after the migrations landed. Done at 13:39: mobile 61 on the homepage, 72 on browse, 60 on the event page (desktop 92, 98, 94). All three are LOWER than Friday's 68, 75, 68. Before writing that down as a regression I measured the three production deployments that are still reachable at their own addresses, back to back, on the same afternoon: Friday's tree scored 59, 67, 51; the C14 tree 59, 66, 65; the C8 tree 62, 60, 62. Friday's own tree scores nine to seventeen points below its Friday number today, so the fall is this machine this afternoon (single runs on one page ranged from 54 to 76), not anything that shipped. The three trees are inside that spread of each other: on production's two-event catalogue the C8 change is neither a measurable win nor a measurable loss, and the 95 remains NOT MET as the ledger already said. The lesson is written into C8 CORRECTED's plan: this laptop cannot rank trees on production; the CI runner, judged on medians, is the yardstick.

**Evidence:** C:\dev\EVIDENCE\C8\gate-pass-on-push-bringup.txt, production-healthy-c8-merge.txt, lighthouse-production-after.log, after-metrics.txt, ab-c3.log, ab-previous.log, ab-current.log.

## C8 CORRECTED (7 September 2026, 14:12 to 16:15): the gate now tells the truth, here is the first honest table, and the 95 decision is yours

**What changed in the gate.** Your section of 14:00 was read in full and done in order. The Lighthouse behind the gate moved from 12.1.0 to 12.6.1 (the latest Lighthouse CI package, checked against the registry before the pin moved), so it can now name the element that paints last. Every score floor now judges the MIDDLE of the runs, not the best one; there are five runs per page, not three, as the constitution has always said; the waiver that pointed at a path the platform no longer serves is gone (the community pages it was meant to protect score 0.93 on the runner and need no waiver). A new table prints after every collection, locally and on the runner. No threshold moved down, nothing moved from error to warn, and the homepage waiver you already knew about is untouched (it expires 1 November).

**Two things to know about the numbers before you read them.** First, the same tree scores differently in the two places it is measured: the local gate on this machine (a warmed server, the test catalogue) reads 5 to 15 points above the GitHub runner (a Vercel preview), and neither is production. The runner is the place your Lighthouse CI emails come from, so the runner table below is the one to plan against. Second, the old "0.77" and "0.76" figures you were quoted were the BEST of three runs; the medians behind them were 0.75.

**The truth table, local gate, Lighthouse 12.6.1, five runs per page, medians (the spread in brackets), from the push that carried this change:**

| URL | runs | performance (median, spread) | LCP | TBT | CLS | script | LCP element |
|---|---|---|---|---|---|---|---|
| / | 5 | 91 (88 to 92) | 3,405 ms | 73 ms | 0.000 | 190 KB | the hero raster (div.group > div.absolute > div.hero-grade > img) |
| /community/african | 5 | 91 (91 to 91) | 3,416 ms | 40 ms | 0.000 | 188 KB | the hero raster |
| /events | 5 | 90 (89 to 91) | 3,550 ms | 31 ms | 0.000 | 201 KB | the first rail card image (img.card-media-img) |
| /events/arena-sessions-large-room-performance-test | 5 | 88 (87 to 91) | 3,806 ms | 45 ms | 0.000 | 225 KB | the hero raster |
| /events/artist-layer-launch-night-geelong | 5 | 88 (87 to 90) | 3,761 ms | 48 ms | 0.000 | 225 KB | the hero raster |
| /events/browse/melbourne | 5 | 89 (89 to 90) | 3,724 ms | 32 ms | 0.000 | 201 KB | the hero raster |
| /events/cat-indie-sounds-live-at-the-enmore-sydney | 5 | 89 (89 to 89) | 3,675 ms | 45 ms | 0.000 | 225 KB | the hero raster |
| /help | 5 | 95 (95 to 95) | 2,927 ms | 31 ms | 0.000 | 178 KB | the page heading |
| /legal/terms | 5 | 95 (94 to 95) | 2,920 ms | 29 ms | 0.000 | 180 KB | the first paragraph |
| /login | 5 | 91 (91 to 94) | 3,485 ms | 38 ms | 0.000 | 251 KB | the "Welcome back" heading |
| /organisers | 5 | 93 (93 to 94) | 3,183 ms | 40 ms | 0.000 | 186 KB | the hero raster |
| /pricing | 5 | 94 (94 to 95) | 3,026 ms | 28 ms | 0.000 | 177 KB | the page heading |
| /signup | 5 | 91 (91 to 91) | 3,488 ms | 30 ms | 0.000 | 252 KB | the digest opt-in label |

**The same table on the GitHub runner (the Vercel preview of the same tree, the place your Lighthouse CI emails come from), Lighthouse 12.6.1, five runs per page, medians:**

| URL | runs | performance (median, spread) | LCP | TBT | CLS | script | LCP element |
|---|---|---|---|---|---|---|---|
| / | 5 | 83 (68 to 88) | 2,418 ms | 530 ms | 0.000 | 408 KB | the hero raster |
| /community/african | 5 | 92 (92 to 93) | 2,499 ms | 259 ms | 0.000 | 405 KB | the hero raster |
| /events | 5 | 90 (72 to 93) | 2,569 ms | 305 ms | 0.000 | 419 KB | the first rail card image |
| /events/arena-sessions-large-room-performance-test | 5 | 74 (74 to 85) | 4,259 ms | 395 ms | 0.000 | 440 KB | the hero raster |
| /events/artist-layer-launch-night-geelong | 5 | 82 (78 to 90) | 4,049 ms | 246 ms | 0.000 | 440 KB | the hero raster |
| /events/browse/melbourne | 5 | 92 (90 to 93) | 2,652 ms | 246 ms | 0.000 | 418 KB | the hero raster |
| /events/cat-indie-sounds-live-at-the-enmore-sydney | 5 | 76 (73 to 80) | 4,261 ms | 365 ms | 0.000 | 440 KB | the hero raster |
| /help | 5 | 93 (91 to 93) | 2,622 ms | 233 ms | 0.000 | 396 KB | the page heading |
| /legal/terms | 5 | 92 (90 to 92) | 2,291 ms | 302 ms | 0.000 | 397 KB | the first paragraph |
| /login | 5 | 88 (88 to 91) | 2,577 ms | 367 ms | 0.000 | 467 KB | the "Welcome back" heading |
| /organisers | 5 | 92 (92 to 94) | 2,436 ms | 252 ms | 0.000 | 404 KB | the hero raster |
| /pricing | 5 | 96 (94 to 96) | 2,268 ms | 187 ms | 0.000 | 396 KB | the page heading |
| /signup | 5 | 91 (91 to 95) | 2,575 ms | 287 ms | 0.000 | 469 KB | the digest opt-in label |

The runner's verdict under the new median floors: two pages FAIL the 0.80 floor at error level, the two heavy event pages (74 and 76); the homepage (83) is above the floor and in any case still under its dated waiver; everything else passes. The event-detail budget (blocking time, biggest paint, main thread, script bytes) passes on all three event pages, the biggest paint by a hair (4,259 ms against 4,500). The runner run took 28 minutes inside the new 45 minute budget. The runner carries about 200 KB of script the local gate does not, because the error-reporting SDK only loads where its key is configured (the preview and production), which is most of why the two environments disagree and why the runner is the table to plan against.

**What the table says.** Every page is limited by ONE thing: how long the biggest element takes to paint (LCP, 2.9 to 3.8 seconds locally, over 4 seconds on the runner for the event pages). Blocking time is already small (28 to 73 ms locally), layout shift is zero everywhere, and script weight is 177 to 252 KB per page. On every content page the element is the hero photograph; on browse it is the first card image; on the text pages it is the heading. On production today, with two events, the homepage's biggest element is a rail card image, not the hero, which is the C17 problem seen from the other side.

**What 0.95 on mobile costs (C8.7).** Lighthouse weights the mobile score as blocking time 30 percent, the biggest paint 25, layout shift 25, first paint 10 and speed index 10 (Google's own scoring page for Lighthouse 10 and later, read today), and its "good" bands are: biggest paint under 2.5 seconds, blocking time under 200 ms, first paint under 1.8 seconds, speed index under 3.4 seconds (each metric's page on developer.chrome.com, read today). We already sit inside the good band on blocking time and layout shift. The whole gap is the biggest paint: 3.0 to 3.8 seconds locally and 4.2 on the runner against a 2.5 second target. To reach 0.95 the hero photograph has to be on screen more than a second earlier on a simulated slow phone, on every content page, which means: (1) the error-reporting SDK out of the paint window (your 25 August ruling keeps it on load; the measured effect of moving it was 74 to 92 on the event page on the same preview, the single biggest lever and one line if you rule it); (2) the shared client shell split so the hero is not queued behind the platform's JavaScript (Issue #42, the architectural change: two to three weeks of work at about half an hour of gate per push, with the five C14 screens re-measured after each step under the champion rule, because it touches the same layout); (3) the hero image delivery itself (its size and priority per viewport, days, and it overlaps C17, which is rebuilding that hero anyway). The honest estimate is three to four weeks of focused work, with the 95 not guaranteed on the runner even then, because the runner's own variance is about 5 points on these pages.

**Where the gate would sit if set where the platform performs today.** If the error floor were placed just under today's runner medians, per route, the platform would pass now and the ratchet would only ever move it up: the two heavy event pages 0.73 and 0.75, the Geelong event page 0.81, login 0.87, /events 0.89, browse and terms 0.91, community and organisers 0.91, help 0.92, signup 0.90, pricing 0.95, and the homepage 0.82 once its waiver ends. I have NOT set any of these. The floor stays at 0.80 everywhere it was, the homepage stays at warn until 1 November, and nothing was set in between, as you said.

**Your decision.** Either 0.95 on mobile gates the launch, and the three items above become the next weeks of work before anything else ships to the five screens; or 0.95 is the ratchet's target, the floors are set just under today's medians and raised after each improvement, and the launch is gated on the floors never moving down. I have stopped here on C8, as instructed, and moved to C17 (the empty hero), which the launch also needs and which shares the hero-image work with item (3).

**Evidence:** C:\dev\EVIDENCE\C8\gate-pass-on-push-c8-corrected.txt (the local table, five runs), rebaseline-lhci-0.14.x.txt and rebaseline-lhci-0.15.1.txt (both Lighthouse versions on one build), docs/perf/LIGHTHOUSE-12.6.1-REBASELINE-2026-09-07.md (in the repository), lh-scoring-page.html and the five metric pages (the sources for the weights and bands), runner-lighthouse-0.15.1-five-runs.txt (the runner table, run 34087352524).

## C17 (7 September 2026, 15:44 to 18:06): the homepage hero never renders without imagery again, and every empty page was checked

**What you saw, and why.** The dark rectangle was the hero's "no events" branch: a flat navy banner by design. Production held four events and every one had ended (two on 15 August, one on 31 August; the fourth is cancelled), so the homepage query returned nothing. Nothing was broken; the fallback was a panel instead of a photograph. Your three licensed homepage photographs were already in the repository, with their attribution file, and the empty branch never used them.

**What a visitor sees now.** With no featured event the homepage wears one of your three homepage photographs (the daytime festival crowd today; the set turns over by the day, so the same picture holds for a whole day and changes tomorrow) under the same frame as a featured event: the gold EventLinqs eyebrow, "Every community. Every event. One platform.", the subline and the gold "Browse all events" button. If the photograph ever fails to load, the hero paints the navy and gold treatment behind the same words instead of a broken image icon. A build guard now fails if that branch stops wearing a photograph from the set, if a photograph in the set loses its licence entry or its file, or if the media component loses its failure path; it was proven to fail both ways.

**Measured, not assumed.** Production, three viewports, light and dark (identical: the platform has no dark theme, recorded by hash): the curated hero paints with zero layout shift and the photograph is the LCP element; with the photograph aborted the treatment paints with the text at 17 to 1. The first drive found the words too light over the daytime picture: the headline cleared only 2.3 to 1 at 390 (4.3 at 1440) and left "platform." alone on its last line at 390 and 768. Your three photographs were then composited offline at the exact geometry and the shared scrim re-tuned to the lightest setting that clears 4.5 to 1 for the headline and subline on all three at every viewport; the headline now wraps phrase by phrase. After that deploy: the headline clears 9 to 1 at 390 (median 10.2, and 5.6 at the brightest tenth of the ground), 14 at 768 and 13.6 at 1440; the subline 15 or better everywhere; no last line shorter than two words; the gold button 10 to 1 on its own fill and 8 to 9 to 1 off the picture behind it; layout shift zero. The lower half of the photograph now sits under a deeper navy wash and the upper half stays clear, which is the trade the 4.5 target asks for. The gold eyebrow above the headline reads at about 2.5 to 3 to 1 on the two brightest pictures at 390; it is a brand label, and darkening the picture further to lift it did not seem worth the trade, so it is recorded here for you rather than changed.

**Lighthouse on production after the change (mobile, three runs):** the homepage 76 median (runs 89, 76, 76), LCP 3.0 to 4.5 s, against 59 to 62 this afternoon before it; desktop 95. The LCP element is now the hero photograph. The 2.5 second budget in your section is not met on the simulated slow phone and is reported as such; it belongs with the C8 decision.

**Every page that can be empty.** Browse, city browse, city, suburb, community, community-by-city, faith, category, venue and the feed were captured on production, where nothing is listed, at 390 and 1440 with real slugs from the sitemap. Every one renders a considered empty state with a next action (the city and community pages carry "the first ... event could be yours" with an organiser button; the faith page "Be the first"; the venue page "No upcoming events just yet" with browse and directions; the feed asks a visitor to sign in). No artist page exists on production yet. Three things were wrong and are fixed: the browse page said "No events match these filters" and offered "Clear filters" when no filter was set (it now says "No events listed yet" with "Put on an event" and "Explore by city"); the venue page without a photograph painted the same flat navy rectangle (now the branded treatment); and "Australia largest" was missing its apostrophe in three places.

**Two things for you, no action taken.** (1) The category pages carry an "Active in" band that lists overseas cities: Business & Networking names London, Toronto, New York and Washington DC; the music categories name Birmingham, Houston, Atlanta, Miami, Lagos and Johannesburg. The community editorial also carries Toronto entries by design, so the data layer is wider than "for Australia" on purpose; whether the category band should say that on an Australian launch is your call. (2) Five more surfaces use the same flat navy gradient as their no-photograph fallback (the cities and communities index heroes, the city hero, the waitlist, the homepage bento); swapping them to the branded treatment is a small follow-up if you want the same standard everywhere.

**Licence facts I could not verify (Law 7).** The attribution file records the licence holder (EventLinqs) and the source (Adobe Stock / Stocksy) but not the licence numbers or model releases; both are UNSOURCED in the ledger until you point at the receipts.

**Evidence:** C:\dev\EVIDENCE\C17\ (production-events-probe.txt; prod-empty\, prod-failed\ and local-featured\ with the measure tables; empty-surfaces\; scrim-sim-round2.md; lighthouse-prod-c17-before-scrim.log; guard-failure-drills-c17*.txt; gate-pass-on-push-c17*.txt).


## C9 (7 September 2026, 18:07 to 19:10): a typed address that cannot be placed on the map now says so, instead of saving unplaced

**What was wrong.** When an organiser typed a venue address and did not pick it from the suggestions, the platform tried to place it on the map on the server, could not (on production the server key is your browser key, which Google refuses for this), wrote a line in the server log, and saved the event anyway with no coordinates. Nothing told the organiser; nothing told you. Every typed address on production would have been invisible to its city map, its suburb page and distance search.

**What happens now.** On production and on previews, that save is refused with a message the organiser can act on. If the cause is our configuration (the server key missing, or the browser key standing in for it) the message says exactly that, names GOOGLE_MAPS_API_KEY, and tells them to pick the venue from the suggestions, which carry their own coordinates, or to contact hello@eventlinqs.com. If Google refused or found nothing, the message names that and says to check the address or pick from the suggestions. A virtual event, a venue picked from the suggestions, or an event with no address at all are unaffected. On a local developer checkout the save is still allowed, with the reason written to the log, because the server key is deliberately kept off that environment.

**Proven, not assumed.** A build guard runs the rule against six cases (including "key absent on production") and refuses the build if any production case is let through or the message stops naming the fault and the way out; it was shown failing both ways. Then, as a real organiser minted on the test database, I signed in on this branch's Vercel preview and on the local build, filled the create wizard with a typed Geelong address and no pick, and clicked "Save as draft", at 390, 768 and 1440: the preview refused by name every time and saved nothing; the local build saved the draft with no coordinates and the reason in its log. The key's scopes are pinned by tests: required on production and preview, forbidden on the Development store, allowed in a local file.

**Your step, unchanged.** Mint the separate server key (Geocoding API enabled, no referer restriction), set it as GOOGLE_MAPS_API_KEY on production and preview, then `node --env-file=.env.local scripts/ops/verify-google-maps-keys.mjs`. Until then, organisers on the live site who type an address without picking will see the message above; picking from the suggestions works today.

**Evidence:** C:\dev\EVIDENCE\C9\ (preview-refuse\ and local-allow\ with the tables and six captures; guard-failure-drills-c9.txt; gate-pass-on-push-c9.txt).


## C18 FINAL (7 September 2026, 19:10 to 20:55): the community layer is written into the scope as approved, and nothing was removed

**What was decided and done.** Your ruling: the community layer is an approved, deliberate feature added during the build, and it stays. The scope now says so. A new addendum to Scope v5 (APPROVED BY OWNER, added during build, September 2026) records the 21 communities and their pages, the 21 by 20 community-by-city matrix (420 pages), the five faith pages and three filter-only faiths, how faith sits beside community, and the 22 event categories as built against the scope's 15. All 15 scope categories exist on the platform; seven more exist beyond the scope (Comedy, Festival, Film, Pride, European, Middle Eastern, Pacific) and are recorded as approved additions. One naming difference is reported and not changed: the scope's "Arts & Culture" is the platform's "Arts", because the second word is banned everywhere by the constitution. The scope document's body is untouched; a footer line points at the addendum. No slug was touched anywhere.

**Proven, not assumed.** Every page of the layer was driven on production at 390, 768 and 1440: 469 pages, 1,407 loads, every one 200 with a heading, no error, no broken image. A build guard now fails if any community, city, faith or category leaves the source or the database, or if one is added without being recorded (the fix is always to record, never to remove). Its first CI run exposed two faults in the guard itself (not in anything a visitor sees), both fixed the same evening, and one of them turned into a second guard that stops a mistake this repository had already made twice: a build-time guard reading a file Vercel never uploads.

**Pride, one line, nothing done (C18F.5).** Pride is not one of the 21 community pages. It exists on the platform as an event CATEGORY (`pride`, an approved addition, forwarding to the category browse) and as a row of the legacy `communities` database table, which nothing reads. Whether Pride should also be a community page is yours to decide; nothing was added or removed.

**Also yours, recorded and left alone.** The legacy `public.communities` table holds 14 rows that predate the 21-community layer and are read by nothing in the application (checked 7 September 2026). Retiring it would be a production migration, which is your step by your ruling; the addendum records it and this build did not touch it.

**Evidence:** C:\dev\EVIDENCE\C18\ (drive\c18-drive.md and the five captures; production-categories.txt and production-communities.txt; guard-failure-drills-c18-fix.txt; gate-pass-on-push-c18.txt and gate-pass-on-push-c18-fix.txt; preview-build-log-718d93b1-full.txt).

## C19 (8 September 2026): Google was being told the homepage was the real version of 57 of your pages, and 545 of your 550 sitemap URLs were empty

**What was actually wrong, and it was ours.** Search Console gave you five
exclusion reasons on Saturday. Two of them we caused, and I found both by
fetching the live site rather than by reading the code.

The first is a single line. Our site-wide layout file said "the canonical
address of this page is the homepage", and the framework passes that down to
every page that does not overrule it. Fifty-seven pages did not overrule it, so
each of them was telling Google, in writing, that the real version of itself was
the homepage. Seven of those were pages we actively want ranked and had listed in
our sitemap: every help centre topic. Search Console's first two reasons,
"alternate page with proper canonical tag" and "duplicate, Google chose different
canonical than user", are the name of that mistake.

The second is volume. Our sitemap offers Google 550 addresses. The site publishes
two events. So 545 of those 550 are community, city, suburb and browse pages
holding nothing, differing from one another by a place name. Google's answer to
hundreds of near-identical pages is to pick one and discard the rest, which is
exactly what it reported.

**What happens now.** Every page names itself. And a templated discovery page
stops asking to be indexed until it actually has something on, then starts again
by itself the moment it does. Nothing is hidden from a visitor: all 21 community
pages, all 420 city variants, every city, suburb, category and faith page still
render exactly as they do today and are still linked from the site. The only
thing that changes is what we ask a search engine to file.

**A decision for you, and it is one number.** The threshold is set to THREE
published upcoming events, which is what the close-out named as the default. My
reasoning: one event makes a page real for a visitor, which is why our own rule
says one event shows the rail, but it does not make that page DIFFERENT from the
other 440 in its family, and difference is the thing Google is judging. Three is
the smallest number where the list, the map and the "what is on" heading all
carry something only that page has. It is one named constant and moving it moves
both the pages and the sitemap together. Tell me a different number and it is a
one-line change.

**Two smaller things fixed while in there.** Your organiser identity (the
Organization and WebSite markup Google reads for a brand panel) existed on the
homepage only, so every event page and every community page a search result
actually lands on carried no publisher identity at all. It is now on every page.
And the 21 city browse pages and the 420 community-by-city pages were carrying
one sentence with the noun swapped, while 271 hand-written city-specific
paragraphs sat unused in the repository. They now describe themselves properly,
using copy the platform already owned. Nothing was invented.

**Proof you can check.** Before the change, the checker I wrote was pointed at
the live site and it FAILED, naming /help/getting-started and six sign-in pages
for exactly this defect. After the change it passes against the build. All 550
sitemap URLs were driven before the change and every one answered 200; the same
550 are driven again after the deploy to prove that leaving the sitemap did not
turn any of them into a broken link. Accessibility is zero violations on every
page touched, at 390 and 1440.

**Evidence:** C:\dev\EVIDENCE\C19\ (audit-production.json, the driven audit of
88 routes; sweep-before.json and sweep-after.json, all 550 sitemap URLs;
indexing-drive-production-before.txt, the checker failing on the live site;
indexing-drive-local.txt, it passing on the fix; drive\ with the tables and
captures at 390, 768 and 1440; guard-failure-drills-c19.txt) and
docs/verification/INDEXING-AUDIT-2026-09-08.md in the repository.

### C19 is live (8 September 2026). The numbers after the deploy, and the one number I need from you.

**Merged, deployed, and checked on the live site.** Production is serving it, CI
on main is green, both addresses answer 200.

| | Before | After |
|---|---|---|
| Addresses we offer Google in the sitemap | 550, of which 545 held no events | 38 |
| Pages telling Google the homepage is the real version of them | 57, seven of them pages we want ranked | 0 |
| Old addresses that now break | n/a | 0 of 550, re-checked after the deploy |
| Pages carrying our organisation identity for Google | 1 | every page |

**Read the 550 to 38 correctly, because it looks alarming and is not.** Nothing
was deleted. All 21 community pages, all 420 city variants, every city, suburb,
category and faith page still load, still look the same, and are still linked
from the site: I re-drove all 550 of the old addresses after the deploy and every
single one answered 200. What changed is that we stopped ASKING Google to file
pages that have nothing on them, which is what it was refusing to do anyway and
reporting back to you as duplicates. The moment a page has three events on it, it
puts itself back in the sitemap with no work from anyone.

**The one thing I need from you: confirm the number is three.** That is the
default the close-out named and my reasoning is in the entry above. It is a
single named constant read by both the pages and the sitemap, so changing it is
one line and one gate run. If you would rather it were one, or five, say so.

**One thing you may want to do, and only you can.** The sitemap regenerates
itself and production is already serving the new one, but resubmitting it in
Search Console needs your login. Nothing in the repository can reach that.

**Evidence:** C:\dev\EVIDENCE\C19\ (sweep-after.json, all 550 old addresses
driven after the deploy; indexing-drive-production-before.txt and
-after.txt, the same checker failing on the live site before and passing after;
drive\prod-tags.md with captures at 390, 768 and 1440).

### C19 again (8 September 2026): I checked my own work against the brief and had missed six things. Here they are, and what finding them turned up.

**What happened.** After C19 merged I ran the self-audit the build brief requires:
take the original text, break it into every separate instruction, and adjudicate
each one against evidence rather than memory. Six instructions I had reported as
covered were not covered. That is a real failure and it is the honest headline.

**The six.** Your section asks four things about every page, and I answered three
of them: I never checked whether a page is reachable by an internal link. It asks
for copy that reflects the specific city, and I fixed the invisible description
and left the visible page alone. It says "validate it, do not assume it" about the
structured data, and I read the labels and stopped. It asks for every URL the
platform has EVER published, and I drove the ones currently in the sitemap, which
is an easier set. It says prove each check fails as well as passes, and two of my
five had never once been seen failing. And it asks for a community page WITH
events, which does not exist anywhere on the platform, so I drove a city page
instead and did not say I had substituted it.

**All six are done now, and doing them found six more faults I had shipped.**

1. **488 of your 550 pages were telling Google "here is a list of events" and
   then listing none.** An empty list is a worse signal than no list, and it was
   on exactly the empty pages this whole item exists to stop advertising.
2. A venue page was publishing an organiser with a blank name.
3. **`/categories/gospel` was bouncing twice** (to `/community/gospel`, which
   bounces again to `/faith/christian`). A double bounce is one of the five
   things Search Console complained about. It goes straight there now.
4. The test that was supposed to catch that double bounce was looking in one
   file and the second bounce was in another. It looks in both now.
5. **Nothing on the platform linked to your five faith pages.** Not one link,
   anywhere, while the communities page's own subheading told visitors they were
   browseable. They now have a "Faith and worship" section on that page.
6. **Nothing linked to the 21 city browse pages or to any venue page either** -
   not even from the event page that prints the venue's name. Both fixed. There
   was even a component written years ago for the city one that was never put on
   a page.

**Why it matters more than it looks.** Since empty pages now leave the sitemap, a
link is the only way in. A page nothing links to and that is not in the sitemap is
invisible to Google entirely. So five faith pages, 21 browse pages and every venue
page were about to become unreachable, and I would not have known.

**What stops it happening again.** Three checks now run on every push, against a
real running copy of the site: the indexing policy, the structured data, and
whether every page we want ranked can actually be reached by a link. Each one was
watched failing on the real fault before it was fixed.

**Nothing changed for a visitor except three additions**, each captured at phone,
tablet and desktop: a faith section on the communities page, the city's own
sentence on the browse page, and the venue name on an event page becoming a link.
Accessibility is zero violations on every one.

**Evidence:** `docs/roast/c19-indexing-2026-09-08.md` in the repository is the
full audit, every instruction with its verdict. Captures and check outputs are in
`C:\dev\EVIDENCE\C19`.

## C10, part one. The Scope v5 audit, and three switches on the event form that did nothing (8 September 2026)

**ONE THING FOR YOU TO DO, AND IT IS ONE COMMAND.**

```
npm run migrate:production
```

That applies two database changes to production. Nothing else in this item can
finish until it runs, because the platform deliberately refuses to build against
a database that is behind its own code. Running it with `-- --dry-run` first
lists exactly what it would do and changes nothing; I have already done that and
it names exactly the two files, nothing else.

### What I audited, and what I found

CLOSE-OUT asked for every numbered section of the scope document to be checked
against the platform, with evidence, not by reading code and guessing. There are
101 of them. I did not type that list: a script reads the scope document and
reports what it declares, so the audit cannot quietly fall behind the document,
and the same script re-runs at the end of the project instead of somebody
retyping it.

Of the 101 sections: 10 are fully built, 48 are partly built, 13 are not built,
and 30 ask for nothing to be built at all (a vision statement, or the criteria
for choosing a developer). Every one of the 183 checks behind those numbers was
driven against the live site and every one passed.

The full table is in the repository at
`docs/verification/SCOPE-V5-AUDIT-2026-09-08.md`.

Two of the gaps stop a real person completing a real journey, so those are the
two I build now. Everything else is written down by name for after launch,
rather than quietly skipped. The big ones on that list are the recommendation
engine, loyalty points, the resale market, event comments and reviews, the
support ticket system, and the public API.

### The thing that was actually broken

Your event creation form had three switches on the Date and Time step:

  - "This is a multi-day event"
  - "This is a recurring event"
  - and the Daily / Weekly / Monthly dropdown under it

None of them did anything. Not "did something small", not "half worked". An
organiser could tick "recurring", choose Weekly, save, and get exactly one
event. Nothing told them. If they reopened the event the tick was still there,
so it looked like it had worked.

This is the worst kind of defect because everything about it was correct except
the last step. The form saved the answer, the database stored the answer, and
the page read the answer back. Nothing in the platform ever LOOKED at it.

### What it does now

**Recurring events are real.** You pick how often it repeats and how many dates,
and before you save anything the form shows you the exact dates it is about to
create. When you save, you get one real event per date, each with its own page,
its own tickets and its own capacity, so one night selling out never closes the
others. Each event page offers the other dates, and your events list says
"Date 2 of 4" so a weekly residency does not read as four unrelated events with
the same name.

There is one detail worth knowing about, because it is the kind of thing that
embarrasses a platform in front of an organiser. Australia has daylight saving.
If you build a weekly series by adding seven days of hours, then the moment the
clocks change your 7pm show becomes an 8pm show, and the organiser finds out
when an audience turns up an hour early. This does not do that. In the driven
proof the four dates are 167, 168 and 168 hours apart, and every single one
starts at 19:40 local, which is exactly right.

**Multi-day is worked out rather than asked.** The checkbox is gone and the
platform now decides from the two times you entered, in your event's own
timezone. A 9pm show finishing at 1am genuinely runs across two days and now
says so on the event page; a twelve-hour festival inside one day does not. It
cannot be wrong, because nobody is being asked to get it right.

### The part that matters more than the fix

I added a check that fails the build if any switch on the event form ever again
writes something nothing reads. Fixing this once is worth little; a platform
that cannot ship a switch that lies is worth a great deal.

I got that check wrong the first time and the drill caught it: it counted a
mention in a code COMMENT as though something were reading the value. So I
deleted the real reader, left a comment behind, and the check said everything was
fine. It does not do that any more, and there is now a permanent test for exactly
that trick. Once fixed, it immediately found one more thing I had missed, which
is now on the event page: a recurring event says "Weekly, 4 dates" in words.

### Proof

Driven at phone, tablet and desktop width, on a real build, signing up as a new
organiser and going through the real form. 24 of 24 checks passed and every test
event was deleted afterwards. Pictures are in `C:\dev\EVIDENCE\C10\series`.

I also found and fixed two mistakes in my own proof script. Four of its checks
were reporting PASS while looking at an empty list, on a run where nothing had
been created at all. A check that passes when there is nothing to check is worse
than no check, because it reads as evidence.

### What is left in C10

The second gap: an organiser cannot create ticket add-ons (parking, merchandise,
drink packages). The buyer side of that feature is fully built and can never
appear, because nothing in the platform can create one. That is next.

## C10, part two. Add-ons: a whole feature that was finished except for the one end you touch (8 September 2026)

**THE ONE THING FOR YOU IS STILL THE SAME ONE COMMAND**, and it now carries three
database changes rather than two:

```
npm run migrate:production
```

### What was wrong

Your platform has supported ticket add-ons since the very first version of the
database. Parking, merchandise, a drinks package, a shuttle. The event page knows
how to show them. The checkout knows how to let someone pick a quantity. The
payment maths knows how to charge for them. The confirmation email knows how to
list them. There is even a rule in the database that keeps the "how many sold"
number honest.

Every single piece of that was built and correct, and not one of them had ever
run, or could ever run, because **there was no way for an organiser to create an
add-on**. No screen, no button, no path of any kind. The feature was finished
except for the one end a person touches.

### What it does now

There is an Add-ons screen on every event, reached from the Quick actions on the
event page. You create one with a name, a description, a price, and optionally a
limit on how many are available. It appears under the tickets on your event page
straight away, and a buyer adds it to their order in the same checkout and pays
once.

You can take one off sale and put it back, which is instant on the public page.
You can edit it. You can delete one nobody has bought.

**You cannot delete one somebody has paid for, and that is deliberate.** The
database itself refuses it, not the button. If it were allowed, the paid line on
that person's order would be left pointing at nothing: a price and a quantity
with no record of what it was for. The screen offers you "take off sale" instead,
which stops it selling immediately and keeps every record. I proved the refusal
by trying to delete it with the highest level of database access there is, and
watching the database say no.

### Something else I found and fixed

While running a check I had not run before, I found a defect already live on the
site, unrelated to add-ons.

When someone is part-way through paying and their ticket hold runs out, checkout
sends them back with a message explaining what happened and that they have not
been charged. In one of those cases the message never appeared. They were sent
back to the browse list with complete silence, which is the worst possible answer
when somebody's card details were on screen a moment ago. The redirect and the
page that receives it were using two different spellings of the same thing.

Fixed, with tests for both spellings.

### And a correction to my own work

I wrote a note in the pricing code claiming a specific example of a rounding
error. I checked it, and the example was wrong. I measured the real behaviour
instead: there are 4,586 prices between zero and a thousand dollars where the
naive calculation would lose a cent, and the first is 29 cents. The code was
already doing the right thing; the explanation was wrong, and now it is measured
rather than remembered.

### Proof

20 of 20 checks, driven at phone, tablet and desktop width on a real build, as a
newly signed-up organiser using the real screens. Every test row deleted
afterwards and the deletion verified. Pictures in `C:\dev\EVIDENCE\C10\addons`.

### Where C10 stands

Both gaps that block a launch journey are now built. The rest of the scope audit
is written down by name for after launch. Nothing here can reach the live site
until you run that one command, because the platform refuses to build against a
database that is behind its own code.

## C10, the self-audit. One instruction I had missed completely (8 September 2026)

After building both gaps I ran the roast gate against C10's own wording, which is
the step that exists to catch me reporting something as finished when part of it
was quietly dropped. It caught one.

C10 has a clause saying that when a section cannot be finished because it needs
something only YOU can supply, it must be marked OWNER BLOCKED and say in one
sentence what is needed, rather than being lumped in with everything else as
"partly built". I had used four labels and never reached for that one. Six
sections that genuinely need you were all filed as "partly built", and in one of
them I had literally written the words "owner blocked in substance" while the
label beside it said something else.

That is the difference between a list you can act on and a list you cannot, so it
mattered.

**Four things are now waiting on you, and they are all outside the code:**

1. **Overseas markets.** The United States and the United Kingdom need a company
   and a tax registration in each. Nothing I write can create those.
2. **PostHog.** The scope names PostHog for product analytics and the platform
   runs Plausible. This is why the specific conversion rate your scope defines
   (checkouts started, divided by event page views) cannot be reported today. It
   needs a PostHog account and key.
3. **SOC 2 and ISO 27001.** These are certificates an external auditor issues.
4. **The security and accessibility audits.** A penetration test, an OWASP Top 10
   review and a formal accessibility audit are reports a third party signs.

None of these blocks the launch. They are recorded so they stop being invisible.

I also added a rule so this cannot happen again: the audit now refuses to run if
something is marked as waiting on you without saying what is needed, or if it
says what is needed while pretending not to be waiting on you. I tested that rule
three ways and watched it refuse each time.

## The positioning you set on 7 September is now in the product (8 September 2026)

### What you asked for

You ruled that EventLinqs is not a ticketing platform, it is the platform where
events get made, that the promise is "You've got help", that the tagline does not
change, and that the words "ticketing platform" and "ticket seller" are never
used for us in copy, metadata, social cards, emails or the About page.

That instruction had not been started. I did it first, before the launch
readiness report, because that report has to sign off the same pages.

### What the site was actually saying

The sentence "The ticketing platform built for every community" was how the
platform described itself in fifteen places: the browser tab title, the link
preview cards, the homepage, the footer, the login page, the About, Press,
Careers and Events pages, the help centre, and four different emails your buyers
and organisers receive. Google is being told the same thing right now: the live
site's machine-readable description says "Live event ticketing platform built for
every community".

It also turned up in four of your own marketing files, including the outreach
messages you send to organisers by name.

All of it now says the same one sentence instead: **"The place events get made,
for every community."** It is written down once and every page reads it from
there, so it cannot go back to being fifteen different sentences.

### The thing worth knowing about

I changed the homepage headline, all the tests passed, and then I drove the real
page on a phone, a tablet and a desktop and the headline was different. The file
I had edited is not used by anything. The homepage hero is a different component
entirely.

That is the same defect I found last session in the event form, where three
controls wrote data nothing read, and it is exactly why nothing here is reported
as done until it has been driven in a browser. The real hero now reads the
tagline from the one source and the tests point at the page that renders.

While there, I found nine components in the homepage folder that nothing imports,
two of which a build check still describes as "the homepage hero". I have not
deleted anything: that is your call. They are listed in the ledger.

### One thing I removed from the homepage

The homepage was selling itself to Google on "No hidden fees, verified
organisers, fair refund policy". That is a ticketing company's pitch and your
ruling says never lead with fees, so it now says what the platform is for. The
pricing page keeps its full fee table, because Australian consumer law requires
the all-in price to be shown plainly and that is not the same thing.

### Three things for you to decide, none of them urgent

1. **docs/STRATEGY-LOCK.md still says the tagline is "Where the culture
   gathers".** Your locked tagline is "Every community. Every event. One
   platform.", and the word "culture" is banned across the platform. I added the
   new positioning to that document without touching anything already in it,
   because it says changes need your decision in writing. That line needs one.
2. **The same document writes the ticket fee as a number.** The rule everywhere
   else is that the fee is written down in exactly one place. A second copy is
   how a deleted fee survived its deletion once already.
3. **CLAUDE.md opens by calling EventLinqs "a complete, general ticketing
   platform for Australia".** Your ruling says never. I followed the ruling and
   left the constitution alone, since that file is yours.

### Still waiting on you, from last session

The three C10 migrations are still not on production, so that work cannot merge.
One command, in a normal PowerShell window, in the repo:

    npm run migrate:production

Until it runs, the platform correctly refuses to deploy code that names a
database column production does not have.

## Three decisions for you, and one command (8 September 2026)

### 1. The command, and it is the same one as yesterday

    npm run migrate:production

Three database changes from the C10 work are still not on production, so that
work cannot merge, and the next piece (the "what do you still need for this
event" form) will queue behind the same step. One command clears all of it. The
platform is deliberately refusing to deploy code that names a database column
production does not have, which is the safety net working, not a fault.

### 2. The positioning work is finished and waiting on your word to merge

Pull request 139. Everything passed: the full local gate (all fourteen steps,
about 37 minutes), then CI: lint, typecheck, build, the whole test suite, the
types guard, the production parity build, and the preview deployment.

One check went red: the mobile performance gate, on three of thirteen pages, at
0.76 and 0.77 against a floor of 0.80.

**It is not this change, and I can prove it rather than assert it.** Both preview
sites were still running, so I downloaded the same event page from the previous
version and from this one and weighed every script each loads:

  - previous version: 17 scripts, 770,981 bytes of JavaScript
  - this version: 17 scripts, 770,981 bytes of JavaScript
  - difference: zero bytes of JavaScript, 452 bytes of text

Identical code, to the byte. I then re-ran the same measurement on the same
commit a second time: it failed again, on four pages, and the same page scored
anywhere between 0.72 and 0.90 across five runs of identical bytes.

**What is really happening** is the thing your own notes already say: the event
and discovery pages sit in the high 0.70s on the test machine, just under the
0.80 line, so whether a change passes depends on which machine it lands on. Two
changes merged yesterday got lucky. This one did not.

I have not lowered the line, not made the check optional, and not merged past it.
Your call: merge it (the check is advisory and the failure is not this change), or
hold it until the speed work is done.

### 3. Two instructions of yours now point in opposite directions

This is the one I genuinely cannot decide for you.

  - Your launch decision of 7 September says performance does NOT gate the
    launch, that what gates it is the platform being operational, and that the
    speed work continues after launch.
  - Your P0 directive, further down the same file, says to do the speed work
    FIRST and to open no more pull requests until every page passes 0.80.

Following the first means carrying on with the launch list and accepting that
some pull requests will show a red performance check. Following the second means
stopping the feature work now and spending the time on page weight.

My recommendation: carry on with the launch list, because your launch decision is
the one that says what launch means, and treat the speed work as the next thing
after it rather than never. But it is your call and I have stopped rather than
guess.

### What I measured for that work while I was in there

The event page loads 753KB of JavaScript. 457KB of that is on EVERY page: three
shared files of 236KB, 111KB and 110KB. The 236KB is React itself and is not
going anywhere. Two separate files totalling 94KB both carry date and timezone
machinery, which looks like the same thing shipped twice and is the first thing I
would read. The session-recording library that your notes name as the old culprit
is already loaded late and is no longer in the way.

### 4. The four items you asked me to split before building

You asked which of the bundle target, WhatsApp sharing, trust signals and fraud
prevention affect a launch journey. Answer: none of them. All four go to the
post-launch list, and here is what is actually missing in each, because three of
the four are further along than the list suggests:

  - **WhatsApp sharing** is built on the event page, the Launch Kit and squad
    invites, each with its own preview card. The only flow missing it is passing
    a ticket to someone else, which is email only.
  - **Trust signals** are built on the event page and at checkout, and refund
    policies are visible everywhere they should be. Missing: a real verified
    badge (the code deliberately says "Community organiser" rather than claim a
    verification that does not exist yet) and a public page explaining what
    happens when something goes wrong.
  - **Fraud prevention**: the half that stops the same ticket being used twice is
    built and driven, including offline and across two doors. The rotating code
    and cryptographic signing are not.
  - **The bundle target** is the speed work above.

---

## 8 September 2026, session 44. M1 is built: organisers can tell us what they still need

### What you can now do, in plain words

When an organiser creates an event, the last thing they see before publishing is
"What do you still need for this event?" with 21 things to tick, a budget range
and a box for anything else. The same question sits on every event's own screen
in their dashboard, so they can answer it later or change their mind.

It is optional in the strongest sense I could build. An event publishes exactly
the same whether they answer or not, nothing is disabled by it, and I proved
that by creating an event with the question on screen and deliberately not
touching it.

What they are told when they send it is the part I want you to read, because it
is a promise you will have to keep:

> Saved. Someone from EventLinqs will be in touch about this. It has not been
> sent to any supplier.

There is no supplier network yet, so the screen never says we are matching them
or getting quotes. Your own close-out says you work the first fifty by phone and
calls that deliberate. The words match that, and a test fails the build if
anybody softens them into a promise the platform cannot keep.

You see all of it at Admin > Organiser requests: the event, its date, the venue,
the organisation, who filed it, what they ticked in plain words, their budget
range and their notes, newest first, so you can pick up the phone.

### The one thing I need from you before any of this can go live

**Run `npm run migrate:production`.** That is the whole ask, and it is the same
one that has been waiting since session 42.

Production's database is four changes behind this machine: three from C10 (event
series, multi-day events, and the add-on delete rule) and one from M1 (the four
tables behind the request). Until you run it, two finished branches sit on this
laptop unable to push, and that is the safety catch working rather than
something broken. Applying a change to the live database is the one thing you
said you wanted to press yourself, and I have not touched it.

There is nothing else for you to do. Everything after that command is mine.

### What I found wrong and fixed on the way, including in my own work

The most useful failure was in a guard I had just written. It is supposed to
refuse a change that stops reading the category list from the database, and I
tested it by breaking the code on purpose. It did not notice, because I had
asked it to look for a name inside a line rather than for the whole call, and a
renamed table still contained the old name. Fixed, and it now fails properly.

Three more were in my own proof rather than the product, and all three would
have told you something false:

- A check compared a heading against the database while the screen renders it in
  capitals. It failed all seven headings and the product was right every time.
- A helper that checks "every one of these" was silently ignoring position, so
  an ordering check was comparing against nothing.
- Some lines printed as PASSED with the words explaining why they would have
  failed sitting beside them, which is an unreadable report.

And one that mattered more: the accessibility scan was set up to run after the
test data had been deleted, so it would have scanned a missing page and reported
a clean bill of health. It now runs on the live screen while the organiser's
answer is on it. Zero problems found, on all four screens, on a phone and on a
desktop.

### Still waiting on you from before, unchanged

Pull request 139 (the positioning wording) is open and not merged. The only red
check on it is the speed one, and I measured that it is not caused by that
change: both previews serve byte-identical JavaScript. Your call whether to
merge it or hold it.
