# EventLinqs Launch Density Layer - SPEC (prepared now, build after Gate 1 and Gate 2)

**Status:** Prepared and ready to hand to CC. Do NOT build yet. This runs only
after Gate 1 (the live verification pass is green on the TEST preview) and Gate 2
(the founder has walked the preview and approved it). It is a pre-launch build,
not a tonight build.

**Inherits:** the `CLAUDE.md` Definition of Done (SHIP 100%, A to Z), the locked
Growth plan (the launch shape: nationally available, locally dense), Law 2
(evidence-driven), Law 3 (Australia-smart), Law 5 (zero dead links), the Design
system and `MEDIA-ARCHITECTURE.md`, the `competitor-benchmark` and `seed-events`
skills, and the `founder-step-delivery` standard for any manual step.

**Does NOT touch:** the funds-holding payment engine. Does NOT write to
Production. Writes only to TEST (vkapkibzokmfaxqogypq).

**Moat layer:** this is pillar 2 (local density) of `MOAT-DOCTRINE.md`, and it
switches on pillars 4 and 6 early: the funnel doubles as venue and organiser
recruitment, and the notify-me capture seeds the demand graph for the next
geography.

---

## The goal

Launch with the focus geography (Geelong, then Melbourne) feeling full and
credible, every other geography dressed as a recruitment funnel rather than an
empty room, and national availability fully preserved. This is the cold-start fix,
executed the way the research demands: depth before breadth, real supply, nothing
fake ever sold.

## The one reconciliation to get right (important)

The founder's launch instinct, concentrate on Geelong and Melbourne, is correct
and is the locked launch shape. One adjustment against a common piece of generic
advice: do NOT hide, block, or lock out the other cities. The locked doctrine is
"nationally available, locally dense," and national availability is kept. So:

- Every city stays SELECTABLE, and any organiser can create an event in any city.
  We never wall a city off.
- We concentrate the DEFAULT experience and all seeding and recruitment on the
  focus geography.
- Empty geographies show a designed funnel, not a blank page and not a hard "not
  available here" wall.

Same density outcome, no loss of national reach, consistent with the constitution.

## Scope (build all of it, A to Z, no partial)

1. **Seed and demo data gating.** The platform was populated with demo events for
   visual review, all flagged `is_seed_data`. Gate public visibility AND the
   ability to purchase on `is_seed_data` being false, so the public and the
   checkout only ever see real, verifiable events. Do NOT delete the seed rows;
   they remain for staging and testing. Per Law 3 and the `seed-events` skill, and
   the Definition of Done (nothing fake is ever sold). Legal note: letting a member
   of the public buy a ticket to an event that does not exist is a trust break and,
   under Australian Consumer Law, misleading conduct. The flag is the lever, not
   the delete key. Note: any community taxonomy touched here uses "community", never
   the banned word (see `KNOWN-DEBT.md`, the `arts-community` slug).

2. **Focus-geography default experience.** The default homepage and feed surface
   the focus geography (Melbourne and Geelong) without the user having to filter
   for it. Use the EXISTING city selector and location resolution as the single
   source of truth; do not fork or duplicate location logic. Evidence-driven (Law
   2): read the current selector and location code first and extend it.

3. **Region grouping in the selector (soft, accessible).** Group the selector into
   Active regions (the live focus geography) and Expansion regions, with the
   expansion regions clearly marked, for example "we are concentrating in Victoria
   first, notify me or list your event here." Marked, never disabled or removed.
   Selecting an expansion region takes the user to that region's funnel, not an
   error.

4. **Geolocation default (with override).** Default a visitor's location to the
   focus geography when their IP resolves to Victoria, and to the nearest sensible
   experience otherwise, always with a visible, one-tap override. IP location is
   imperfect, so the override is mandatory and the user's explicit choice always
   wins. Functional change: it flows through the existing selector as the single
   source of truth.

5. **Zero-state as a funnel (the magnet).** An empty geography shows a designed
   surface, never a bare white band: "Events are coming to [city]. Are you an
   organiser? List your event free. Want in? Notify me." Two real, working
   actions: an organiser CTA (the invite-an-organiser loop) and a notify-me email
   capture. The notify-me capture writes to the demand graph so the next
   geography's launch list is already building (pillar 6 early). Must meet the
   premium bar and `MEDIA-ARCHITECTURE.md`: real imagery through the media library,
   treated surfaces, the single hero standard (432 desktop, 354 mobile), zero dead
   links (Law 5), branded placeholders only where genuinely needed. No bento grids.
   No bare text where a competitor shows imagery.

6. **Truthful info-only listings (optional supply dressing).** Genuine public free
   events MAY be listed to dress the focus-geography grid, clearly marked
   information only with tickets at the official source and an outbound link. They
   are never sold through EventLinqs and never imply they are. Do NOT scrape
   third-party sites wholesale; that carries terms-of-service and copyright
   exposure a solo founder should not take on. Manual curation of real public
   events only.

7. **Operational (not code, captured for the founder).** Hand-onboard the first
   real Geelong and Melbourne organisers before launch (the ranked levers:
   supply-side direct recruitment first, concierge onboarding, a fee holiday
   raised once liquidity exists). The venue pitch material from
   `EventLinqs-Venue-Revenue-Program-SPEC.md` is the recruitment tool and can be
   prepared early.

## Benchmark (before any build, per Law 2 and the gate)

Per the `competitor-benchmark` skill, the launch-zone treatments and the
zero-state funnels are benchmarked with Playwright against the leaders at desktop
1440 and mobile 390 before they are called done: Eventbrite for city and category
zero-states and the "list your event" organiser funnel, with the premium bar
applied the same as the homepage. The single hero standard holds; a taller hero on
any of these surfaces needs fresh competitor evidence, none of which qualified in
the current capture set.

## Sequencing

Gate 1 (live verification green) and Gate 2 (founder preview walk and approval)
come first and are not jumped. This SPEC then runs as one discrete, benchmarked
build, before public launch. The design and presentation pass (Gate 3) and
production promotion (Gate 4, on explicit founder go) follow.

---

## The build prompt (ready to hand to CC, run ONLY after Gate 1 and Gate 2)

```
EventLinqs Launch Density Layer build. Staging preview only. Read every rule before acting.

SACRED RULES
1. Write only to TEST (vkapkibzokmfaxqogypq). Never write to Production (gndnldyfudbytbboxesk), for any reason.
2. Do not touch or modify the funds-holding payment engine. This build is discovery, location, and zero-state surfaces, not payments.
3. Single source of truth. Use the EXISTING city selector and location resolution. Do not fork or duplicate location logic, and do not fork the seed-data flag logic.
4. National availability is kept. Every city stays selectable and any organiser can create an event in any city. Concentrate the DEFAULT experience and seeding on the focus geography (Melbourne and Geelong). Never wall a city off or render a hard "not available here" block.
5. Nothing fake is ever sold or shown to the public. Gate public visibility and purchase on is_seed_data being false. Do NOT delete seed rows.
6. Australian English. No em-dashes and no en-dashes (hyphens, colons, commas, pipes are fine). The word "culture" is banned in every form, in copy, routes, slugs, identifiers, and data: use "community".
7. Definition of Done applies (SHIP 100%, A to Z): zero placeholders, zero stubs, zero dead links, real data, full function. If you cannot reach 100 percent, report the exact remaining items as NOT DONE and never imply completeness.

PHASE 0, evidence first (Law 2, read before building, no writes)
0.1 Read and report the current mechanism for each of: the city selector component and how location is resolved (IP, cookie, default); the homepage and feed data source and how it filters by location; the is_seed_data flag and exactly where visibility and purchase are (or are not) gated on it; the existing community-city pages and routing; the zero-state surfaces that render today when a geography is empty; the media components from MEDIA-ARCHITECTURE.md available for these surfaces.
0.2 State plainly what already exists versus what must be built for each scope item below, with file-level evidence. Do not start building until this map is reported.

PHASE 1, benchmark (competitor-benchmark skill, before building)
1.1 Capture and report the relevant competitor treatments with Playwright at desktop 1440 and mobile 390: Eventbrite city and category zero-states, and the "list your event" organiser funnel. Apply the premium bar. Confirm the single hero standard (432 desktop, 354 mobile) holds for these surfaces, or surface fresh evidence if one genuinely runs taller.

PHASE 2, build (on the TEST preview, to the Definition of Done)
2.1 Seed and demo data gating: gate public visibility and purchase on is_seed_data = false. Seed rows stay in TEST, just hidden from the public and the checkout.
2.2 Focus-geography default experience: the default homepage and feed surface Melbourne and Geelong without the user filtering, through the existing selector and location resolution.
2.3 Region grouping in the selector: Active regions versus Expansion regions, expansion marked with a notify-me and list-your-event affordance, never disabled. Selecting an expansion region routes to its funnel.
2.4 Geolocation default with mandatory one-tap override, flowing through the existing selector, user choice always wins.
2.5 Zero-state funnel: a designed surface with a working organiser CTA (invite-an-organiser loop) and a working notify-me email capture that writes to the demand graph. Premium bar, real imagery, treated surfaces, single hero standard, zero dead links. No bento.
2.6 Optional info-only listings support: a clearly marked information-only listing type with an outbound link, never sold, never implied as sold. No scraping.

PHASE 3, verify (real evidence per item, PASS or FAIL or NOT VERIFIED, no fabrication)
3.1 For each scope item: the observed evidence (the URL and screen, the row written to TEST, the redirect, the captured benchmark verdict). A green unit test is not a live PASS; the live PASS is the runtime evidence.
3.2 Confirm the public and checkout cannot see or buy an is_seed_data event. Confirm an expansion city is reachable and shows the funnel, not an error (Law 5). Confirm the notify-me capture writes the row. Confirm the geolocation default sets the right experience and the override works.
3.3 Run the competitor benchmark gate (desktop 1440, mobile 390) and report SURPASS, PARITY, or BELOW per surface.
3.4 Flag every test row created with is_seed_data true and list them all for cleanup. List every non-database change (commits, deploys, alias moves).

REPORTING
A. One table: scope item, verdict, evidence.
B. The benchmark verdicts per surface.
C. The plain bottom line: is the launch density layer 100 percent done on the preview, yes or no. If no, list the exact NOT DONE items.
D. Any manual step the founder must take, in the founder-step-delivery format (place, link, action, success), with no em-dashes or en-dashes.

Begin with Phase 0. Do not build until the evidence map and the benchmark are reported.
```
