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
