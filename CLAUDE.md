# CLAUDE.md - EventLinqs

This file is the constitution. It is complete, findable, and unskippable: every
law of the platform lives here or is pointed to from here, once, with no
contradiction. These are the laws. They override default instincts and need no
re-prompting. If a law and a user instruction conflict, the user wins; otherwise
these hold. Founder and approver: Lawal Adams. "Approval" below means his
sign-off.

## Law 0: read the constitution before you build

This is the first instruction of every session and it is mandatory.

1. **Read before you edit.** Before the first edit of any task, read the
   constitution sections that govern the surfaces you are about to touch (use the
   Constitution map below to find them). Reading "it looks like a one-liner" is
   not an exemption: a one-line change to a card, a hero, a rail, a colour, a
   route, or a piece of copy is governed by these laws.
2. **State your governing laws.** Before editing, state in the session which laws
   govern the task (by name or number, e.g. "this touches Law 1, the Design
   system, Motion, and Law 5"). If you cannot name them, you have not read
   enough yet.
3. **Verify-first, always.** State how the result will be verified before you
   write code, and confirm every claim against the real environment, never from
   memory or assumption (see Verification and gates).
4. **Plan mode for any new build.** Think and plan before touching code.
5. **Nothing generic, nothing invented.** You may not introduce a colour, size,
   font, layout, taxonomy, or number the evidence and the code do not already
   support. Inherit from the code; surpass the competitor; invent nothing.

If a law here is contradicted by any other document in the repo, this file wins
and that document is wrong until reconciled. Report the contradiction; do not
silently follow the stale doc.

## Constitution map (find the law that governs your task)

| If you are touching... | The governing laws are... |
|---|---|
| Any surface at all | Law 0, Definition of Done, Law 1 (no generic), Law 7 (research before recommending), Verification and gates |
| Stating ANY specification, dimension, limit, price, format, register, or platform behaviour | Law 7 (research before recommending). Fetch the primary source FIRST and cite it, or mark it UNSOURCED |
| A third-party platform spec (Instagram, Meta, X, TikTok, Stripe, Google, Apple) | Law 7. That platform's own published page, never a secondary guide |
| A competitor claim (Eventbrite, Ticketmaster, DICE, Humanitix, TryBooking, Moshtix, Oztix) | Law 7 plus Law 2 (evidence-driven), `competitor-benchmark` skill |
| Writing ANY commit message | Law 8 (authorship). No Co-Authored-By naming Claude or an AI, no "Generated with", no robot emoji. The founder is the sole author |
| Setting up a new worktree or clone | Law 8. Run `git config core.hooksPath .githooks` before the first commit |
| Pinning or changing ANY version: a runtime, a dependency, a platform setting, an API version, a framework target | Law 9 (current by default, never backwards). Fetch the vendor's support schedule FIRST and cite it; never resolve a mismatch by downgrading |
| A version disagreement between two environments (`.nvmrc`, `engines.node`, a workflow pin, a dashboard setting) | Law 9. Bring the OLDER one forward, never the newer one back |
| Reporting any feature or task done | Definition of Done (SHIP 100%, A to Z) |
| Growth, sharing, invites, referral, attribution, the wedge, the levers | Growth plan, `event-demand-engine` skill |
| Discovery, feed, follows, alerts, push, who's-going, recommendations | Growth plan (the demand engine), `docs/MOAT-DEMAND-ENGINE-PLAN.md`, `event-demand-engine` skill |
| Organiser attendee data, export, the data-ownership pitch | Growth plan (data-ownership promise), Law 4 |
| Sitemap, structured data, indexability, organic SEO | Growth plan (SEO compounding engine) |
| A new page or a redesign | Law 2 (evidence-driven), Design system, Motion, Law 4 if marketing, the `page-build` skill |
| Copy, labels, microcopy | Copy and banned content, Law 3 (Australia-smart) |
| Colours, type, spacing, cards, container | Design system |
| A hero, an LCP image, a rail | Design system (Hero and LCP integrity, Rails, Container width), Motion |
| The header or footer | Design system (Chrome consistency) |
| Animation, reveal, hover, glide, loading | Motion |
| A marketing or landing surface | Law 4 (image-rich), Design system, Media architecture |
| Posters, share cards, any organiser-facing artefact carrying an image | Law 6 (render, never generate), Media architecture |
| Anything that would call an image or video model | Law 6 (banned in the product; permitted only for EventLinqs' own marketing) |
| Scenes, categories, taxonomy | Scene layer, Law 3, the `seed-events` skill |
| Seed or demo data | `seed-events` skill, Law 3, Media architecture |
| Links, routes, navigation | Law 5 (zero dead links) |
| A migration or the database | Verification and gates (Migrations) |
| An environment variable, a secret, a store scope, a sender or alert address | `docs/ENV-DOCTRINE.md`, `src/lib/env/manifest.mjs` (declare it there and the guards pick it up), Verification and gates |
| A rate limit: adding one, changing a cap, or flipping fail-open to fail-closed | `docs/RATE-LIMIT-DOCTRINE.md` (AUTHORITY on the fail-open decision and on the `launch-compose` ruling), `src/lib/rate-limit/policies.ts` (the table), `scripts/verify/rate-limit-audit.mjs` (run it BEFORE claiming what a policy costs or what it is keyed by) |
| A fee, pricing, checkout charge, or payout | Fee system (one source), `docs/FEE-SYSTEM.md` |
| Venues, venue enrolment, venue revenue share, venue payout | Venue Revenue Sharing Program (REMOVED 2026-07-05; the section below records the decision), Fee system (one source) |
| CI, gates, delivery | Verification and gates |

**Index of laws:** Law 0 (read first) - Definition of Done (SHIP 100%, A to Z)
- Growth plan (the wedge, the two engines, the levers) - Law 1 (no generic) -
Law 2 (evidence-driven) - Law 3 (Australia-smart) - Law 4 (marketing image-rich)
- Law 5 (zero dead links) - Law 6 (render, never generate) - Law 7 (research
before recommending, no generic knowledge) - Law 8 (authorship, the founder is
the sole author) - Law 9 (current by default, never backwards) - Scene layer -
Design system - Motion - Copy and banned
content - Fee system - Venue Revenue Sharing Program - Verification and gates -
Tooling - Authority docs - Skills.

## What EventLinqs is

EventLinqs is a complete, general ticketing platform for Australia, built to
surpass Ticketmaster and Eventbrite. Treat the fusion of both as the bar to
beat, not to match. Every event type lives here: sports, music, comedy,
theatre, family, festivals, food, corporate. Community is a differentiating
layer on top, roughly 10 to 20 percent of any surface, never the dominant
identity.

Stack: Next.js, Supabase, Tailwind v4, Stripe, Vercel.

## Growth plan (the wedge, the two engines, the levers) - locked 2026

This is the binding growth doctrine, sourced from `EventLinqs-Growth-Plan.md`
and grounded in the proven playbooks of Eventbrite, Humanitix, DICE, and
two-sided-marketplace cold-start research. It governs every feature that brings
users in, keeps them coming back, or pitches the platform to an organiser. The
repo is the source of truth, not memory.

**The proven law (do not violate).** Neither Eventbrite nor Humanitix won on ads
or influencers. They won on three things: a built-in viral loop, a sharp wedge
that made switching obvious, and relentless supply-side (organiser) recruitment.
Two-thirds of failed marketplaces die on the supply side because founders chase
demand volume instead of liquidity. So: build the harder side (organisers)
first, chase density not reach, do things that do not scale, and earn the right
to advertise only after density. For a solo bootstrapped founder paid ads and
influencer sponsorships are the WRONG primary lever and waste money before
density exists.

**The wedge (the one-sentence switching reason).** "EventLinqs puts your event in
front of the right attendees through our discovery feed and push alerts, AND you
own every attendee relationship: no walled gardens, no withheld emails." Two
edges, both grounded in what organisers complain about in 2026:

- DISCOVERY UPSIDE: DICE gets about 40% of sales from discovery plus push.
  EventLinqs offers the same demand engine to every organiser who lists, which
  Eventbrite's marketplace does not push the same way and a shrinking Eventbrite
  is less able to deliver post-acquisition.
- DATA OWNERSHIP: DICE does not share attendee emails and Eventbrite limits it,
  which kills an organiser's ability to build their own audience. EventLinqs
  gives the organiser full attendee data ownership: they own their customers, we
  never wall them off. It is a concrete, provable switching reason that costs
  nothing and the incumbents structurally cannot easily match.

TIMING EDGE (use it now): Eventbrite was acquired by Bending Spoons (March 2026,
about US$500M), taken private, cutting staff, with reports the free tier may be
removed. Organisers are actively evaluating alternatives. Launch into that
opening. Do NOT copy Humanitix's funding model (they are a charity with grants a
sole trader cannot get); copy their wedge-story discipline and organiser
pricing, not their funding.

**The two engines (they are DIFFERENT, build both).** Do not conflate them.

1. The ACQUISITION LOOP (growth: brings new users in, near-zero cost). This is
   what Eventbrite actually grew on. Two sub-loops: (a) SHARE-A-TICKET, after
   buying the attendee is prompted to share the event with a personalised invite
   link that tracks who joined through it, as frictionless as the feed; (b)
   INVITE-AN-ORGANISER, after purchase and in-account a prompt "Run your own
   events? It is free to start" (Eventbrite's single biggest growth hack:
   buyers discovering they can become organisers). Track invite attribution so
   we can see which shares and which organisers drive signups.
2. The DEMAND ENGINE (retention plus discovery: keeps users coming back).
   Attendee taste/follow graph (native, no Spotify dependency), personalised
   discovery feed, alert engine (PWA web push primary at about 5x email
   conversion plus an email backbone), who's-going social proof, follow
   organisers. The AI tuning layer sharpens as real data arrives, but the engine
   is live day one because it IS the organiser pitch. The full architecture and
   phased build live in `docs/MOAT-DEMAND-ENGINE-PLAN.md` and the
   `event-demand-engine` skill. The acquisition loop is growth; the demand engine
   is discovery plus retention. Eventbrite's virality came from the invite/share
   mechanism, NOT the discovery marketplace. Both are required.

**The data-ownership promise (the second blade, make it real and visible).**
EventLinqs gives organisers full attendee data ownership with attendee consent:
export, own the relationship, no withholding. This is an explicit, visible
promise on the organiser-facing pages and pitch, stated plainly, because it is a
structural advantage over DICE (withholds emails) and Eventbrite (limits it).
Never fabricate it: the export surface must actually work.

**SEO (the quiet compounding engine).** Eventbrite's event pages ranked in Google
for years of free organic traffic. EventLinqs already has bespoke
community-by-city intersection pages: the same play. Every event page and every
community-city page ships Schema.org Event structured data, clean human-readable
URLs, fast pages (Lighthouse 95+), and a sitemap submitted to Google Search
Console day one. One paid month of Semrush or Ahrefs only later, when attacking
programmatic SEO across scene-city pages, never before.

**The launch shape: nationally available, locally dense.** Launch the platform
nationally (anyone in Australia can use it), but concentrate RECRUITMENT and
SEEDING effort on the one wedge where the founder has real reach: the Geelong and
Melbourne music and community scenes (DJ ties, local relationships). Depth before
breadth is the single most repeated lesson in the research. National availability
is kept; effort is pointed where it can hit density and flip the network.

**Ranked levers (do in this order).**
1. Supply-side direct recruitment: recruit the first 25 to 50 organisers
   personally and concierge-onboard each; each brings their own audience as free
   demand. The "influencers" worth the time are local organisers, promoters,
   community leaders and DJs who already own an audience, never Instagram
   personalities. Offer early organisers a fee holiday or reduced take-rate, then
   raise it once liquidity exists.
2. The acquisition loop: share-a-ticket plus invite-an-organiser, frictionless.
3. SEO via the community-city pages.
4. Building in public / content (doubles as supply recruiting).
5. Local PR plus the sharp wedge story (the Eventbrite-is-wobbling angle).
6. Paid ads / influencers: LAST, only after density, reframed to local
   organisers.

**What gets built into the platform now (the three build items), plus the
verification.** (1) the share-a-ticket acquisition loop with personalised,
attributed invite links and per-link join tracking; (2) the invite-an-organiser
conversion, attributed; (3) SEO surfacing confirmed on the deployed preview. Plus
VERIFY the demand engine is genuinely built and tested (the wedge depends on it):
follow graph, discovery feed, push plus email alerts, who's-going, follow
organisers. Anything launch-critical that is NOT built gets built before launch;
anything genuinely post-launch is parked honestly (see Launch sequence). The
agentic growth engine / AI operating system is the NEXT major workstream, built
AFTER launch on a live earning platform, never before.

## Definition of Done (SHIP 100%, A to Z)

This is the single, canonical bar for "done" on every surface, feature, and
task. It is binding on every build without being restated in any prompt: if a
prompt is silent on it, it still holds, and no prompt that is silent on it
waives it. It consolidates and strengthens Law 1 (no generic), Law 5 (zero dead
links), and the benchmark and gate rules in Verification and gates.

1. **Nothing ships partial.** Every feature is built A to Z and is 100 percent
   working in production before it is ever called done. "Mostly working", "the
   happy path works", and "done except for X" are NOT done.
2. **Zero placeholders.** No stubs, mocks, fake or hardcoded sample values,
   "coming soon", "lorem ipsum", "Sample Event 1", TODO or FIXME markers, or
   dead links on any shipped surface. A placeholder is a defect by definition,
   never a stub to fix later.
3. **Everything works on real data.** Every link, button, tile, card, and
   action navigates and functions against real data and resolves to a working
   state (HTTP 200, never a 404, a 500, an empty-result dead end, or a no-op
   control).
4. **A QA pass confirms it.** Before "done" is reported, a QA pass verifies zero
   placeholders and full function end to end, by clicking what the user clicks
   on real data, with evidence. Reuse the link-integrity crawler and the
   affordance scan (Law 5) and the per-page production-readiness checks
   (Verification and gates).
5. **Competitor benchmark gate.** Every shipped surface passes the benchmark
   gate against the leaders, Ticketmaster (the lead), Eventbrite, and DICE, at
   desktop 1440 and mobile 390, with an explicit SURPASS, PARITY, or BELOW
   verdict per aspect. Parity is the floor; the goal is to surpass. Any BELOW
   means iterate before delivering.
6. **Honest reporting when not 100 percent.** If a build cannot reach 100
   percent in one pass, the agent reports the exact remaining items as NOT DONE,
   lists them plainly, and never states or implies completeness. Reporting a
   partial build as done is the most serious breach of this constitution.

### The market-ready completeness bar (volume law)

"Works" is not the bar; "complete, full, and world-class" is. The platform must
look and feel complete and voluminous everywhere a real Australian user looks,
standing next to Ticketmaster, Eventbrite and Humanitix from day one.

- **Every rail full and balanced, but NEVER by hiding a real event.** No empty
  sections, no near-empty discovery surfaces, no blank image slots. A route that
  resolves 200 to a designed empty state is correct engineering but is NOT
  market-ready content: an empty city, scene, community, or category a user can
  browse to is a completeness gap, not a finished surface.
  - **ONE EVENT SHOWS THE RAIL (founder ruling, 23 August 2026).** This clause
    used to read "a rail with 1 to 2 items next to a rail with 7 is a defect",
    and that sentence was enforced as `RAIL_MIN = 3` on the homepage, `>= 4` on
    every city, community-by-city and suburb page, and `MIN_RAIL_COUNT = 3` on
    the browse rails. It is REVERSED, and the reversal is a law rather than a
    preference because it was argued both ways once already (the superseded
    ruling is `docs/roast/RAIL-MIN-RULING-2026-08-16.md`).
  - The rule was written for a platform with volume. We do not have volume yet,
    so in practice it hid a real organiser's real event for being the only one
    in its category. The organiser we can least afford to lose is the first one
    in a category, and theirs was precisely the event the page refused to show.
  - **Thinness is answered by filling the rail, never by deleting it.** A rail
    with one event tops up with `InvitationCard`s (`invitationFillCount`), so it
    renders four cards: the real event, then three invitations to be next on it.
    The fill tapers and vanishes by itself at five real events. A sparse rail
    therefore reads as recruitment, which is growth lever 1 rendered on the page.
  - The only legitimate reason not to render a rail is that it has NOTHING to
    show. That decision lives in `EventRailSection` (`events.length === 0`) and
    is never re-derived by a caller. `tests/unit/growth/one-event-shows-the-rail.test.ts`
    sweeps every rail-bearing surface and fails the build if a count threshold
    comes back.
- **All of Australia from day one.** Build for every Australian city and state,
  not four cities. Every city the platform lists must be represented with real
  events and real imagery (or a branded fallback, never a blank tile). The
  by-city rail and the cities page must represent Australia properly.
- **Melbourne-first (and Geelong) is RECRUITMENT and marketing only.** It governs
  where the founder concentrates organiser seeding effort; it must NEVER shape
  what the platform SHOWS. National availability and national density on every
  surface are the display standard from day one.
- **Volume is proven, not assumed.** Density is verified against the live target
  (events per city, items per rail, events behind every scene and community),
  exactly as the Definition of Done verifies function. A thin catalogue fails the
  bar even when every route resolves 200.

## Law 1: no generic

No generic text, layouts, placeholders, or template aesthetics anywhere, ever.
Every surface is luxury-grade and world-class. If a screen could belong to any
other product, it is wrong: rework it until it could only be EventLinqs. A
"Coming soon" placeholder, a wall of text, or a bare icon-and-text band is a
defect by definition, not a stub to fix later.

## Law 2: evidence-driven

Derive structure and layout from captured competitor evidence, never from
assumption. For any page, first capture the equivalent Ticketmaster and
Eventbrite page with Playwright at 1440 and 390.

- Phase A: build what you SEE, to that standard or better. Match information
  density, hierarchy, imagery quality, and polish.
- Phase B: then layer the EventLinqs touch on top: the community rail, scene
  discovery, and the native artist and genre layer.

Never skip Phase A. Never invent a layout the evidence does not support.

### Competitor Benchmark (the encoded DNA - single source of truth)

What the competitors look like is ENCODED, not re-discovered each session. No
design session re-asks the founder what Ticketmaster or Eventbrite look like:

- Read the **`competitor-benchmark` skill** for the hard reference facts -
  measured hero heights per page type (TM home ~200px, TM category ~250-290px
  dark band, EB home ~480px promo, EB browse no hero, EB event-detail contained
  media card, EB pricing tinted bands, EB/TM desktop auth brand panel + mobile
  card-only, TM help dark search band + trending rail), rail variation patterns,
  hover language, and the EventLinqs laws that beat them.
- The evidence is `docs/benchmark/competitor-2026/INDEX.md` (verified capture
  index) + `measurements.json`. Captures are clamped to <= 1800px and audited
  VERIFIED/INVALID.
- Re-capture ONLY when the evidence is stale (>90 days) or you are designing a
  page type not covered. Use the skill's re-capture procedure; for auth pages
  navigate from the homepage account button, never a guessed URL.

**Premium bar (every public page, not just the homepage):** EventLinqs presents
as a premium production worth more than US$200K - rich imagery on every public
page, treated surfaces (never bare white bands), breathing hovers,
competitor-evidence design decisions, zero dead links, zero broken states. A
page that is bare, generic, image-poor, or has a dead link or broken state has
failed the bar regardless of how the homepage looks. Detail in the
`competitor-benchmark` skill.

## Law 3: Australia-smart

Every taxonomy, scene, category, content, and copy decision is verified against
current Australian market data before it ships. Never inherit taxonomy from an
old draft without re-verifying it.

- Demographics (ABS): 32 percent of people are overseas-born. India is the
  largest overseas-born group; China, New Zealand, the Philippines and Nepal
  are among the fastest-growing.
- Ticketing (LPA): contemporary music is about 54 percent of ticketing revenue;
  comedy is the fastest-growing category.

## Law 4: marketing surfaces are image-rich

Every marketing and landing surface (organiser, pricing, about, city and scene
landings, any "sell the platform" page) carries image-rich, full-craft
treatment to the competitor bar. A text-only marketing surface is a design
defect by definition: no bare icon-and-text pillar sections, no wall-of-text
bands. Match the competitor frame for frame (full-bleed photographic hero,
alternating image-and-text feature bands, a stats or social-proof band, visual
how-it-works, image tiles, premium FAQ, a strong closing CTA), then surpass it
with the EventLinqs identity.

- Imagery comes from the licensed platform photo library, wired through the
  media components as swappable slots (a per-page config in `src/lib/images/`),
  so photo-day upgrades are a one-line change and never touch the template.
- Social proof uses real platform truths only (all-in pricing, payout terms,
  every-community breadth). Never fabricate numbers or fake logos.
- Reference build: `/organisers` (`OrganisersLandingPage` +
  `src/lib/images/organiser-photos.ts` + `MarketingMedia`).

## Law 5: zero dead links AND no dead-end tiles

Verify by clicking what the user clicks. A surface is not done until every link
it renders resolves to a working page. Zero dead links platform-wide: every
event card, city or culture or suburb tile, nav item, footer link, and CTA
resolves to HTTP 200, never a 404 or a 500.

- A polished page whose cards 404 on click is a Potemkin facade, not a finished
  surface. The first thing a test-driver does is click; verify by clicking, not
  by a hand-picked slug.
- Density data and detail data must share one source of truth. When the homepage
  is served from a fixture (`HOMEPAGE_SEED_FIXTURE=1`), the detail routes must
  resolve the same events; the two paths may never diverge.
- The automated proof is `scripts/link-integrity-crawl.mjs` (loads each key
  surface, harvests every internal href, requests each, fails on any non-200).
  Run it against the preview or a local production server before claiming a
  discovery or navigation surface done (see Verification and gates).

### Interactive-affordance law (no dead-end tiles)

Any image tile, card, or grid/rail item that visually presents as tappable MUST
be a working link. "No dead links" explicitly includes "no dead-end tiles" - a
tile-shaped image a finger lands on that does nothing is the same defect as a
404, and worse on mobile where the whole tile reads as a button.

- Decorative-only imagery is allowed SOLELY as full-bleed backgrounds (hero
  scrims) or inline editorial photos within prose. It is NEVER permitted as a
  tile/card-shaped element inside a grid or a rail. If it sits in a grid or rail
  and looks like a card, it must link.
- Every tile/card in a grid or rail is wrapped by a single `<a href>` (or is a
  `<button>`) whose target resolves 200. The whole tile is the touch target
  (>= 44px), with hover illumination.
- The automated proof is `scripts/affordance-scan.mjs` (Playwright: on every
  public page, finds tile/card-shaped `<img>` inside grids/rails and fails on any
  with no ancestor anchor/button). It runs beside the link-integrity crawler in
  the audit suite on every pass.

## Law 6: render, never generate (founder ruling 2026-08-08)

**The platform never generates images or video for an organiser's event. Not
now, not ever.** EventLinqs is not a design tool and does not compete with one.
The organiser supplies their artwork, made wherever they like, and our job is to
RENDER what they give us.

- **Upload once, get every size.** One supplied image is composed into every
  format a promoter needs, with their event details, their QR code and their
  tracked link laid over it correctly: a print-ready A4 poster, a 1080x1920
  story card, a 1080x1080 square, a 1200x630 link preview, each cropped and
  composed to that surface's current published specification.
- **No supplied image means a typographic composition** built from the
  organiser's own event details, in the brand system. Never invented imagery,
  never a stock photo standing in for their night.
- **Banned inside the product, in every form:** text-to-image, text-to-video,
  generative fill, outpainting, style transfer, upscaling that hallucinates
  detail, and any third-party generation service called on an organiser's
  behalf. Deterministic composition, cropping, scaling, colour and format
  conversion are RENDERING and are fine.
- **TEXT generation is untouched by this law.** Descriptions, summaries and
  captions are governed by Copy and banned content and the anti-tell gate. Law 6
  is about pixels.

**The boundary, stated so it can never be read as permission.** EventLinqs
generating imagery for its OWN marketing (the platform's hero rasters, launch
videos, social content, the parked Higgsfield creative skill set) is a separate
question and is NOT banned. That is EventLinqs making EventLinqs' own artwork.
It never touches an organiser's event, never renders into a Launch Kit artefact,
and never becomes a product feature. Anything on that side of the line goes
through the licensed platform photo library and the media components
(`docs/MEDIA-ARCHITECTURE.md`), never into the organiser path.

Struck by the same ruling: the Midjourney category cover photography planned in
`docs/MASTER-PLAN-V1.md` (Phase 1, Week 5). Generated imagery on public category
surfaces is exactly the generic risk Law 1 exists to stop.

## Law 7: research before recommending, no generic knowledge (founder ruling 2026-08-09)

No recommendation, specification, dimension, limit, price, format, register, or
platform behaviour may be stated on this project from memory. The first action on
any such question is to fetch the current primary source and cite it beside the
claim it supports.

**The order is fixed: research, then verify, then recommend.** Never recommend
and then research when challenged.

Where a competitor's practice is relevant, and on a ticketing platform it usually
is, the research must include what the market actually does: Eventbrite,
Ticketmaster, DICE, Humanitix, TryBooking, Moshtix, Oztix. Their own published
pages, never a blog about them.

Where no primary source can be found, say so plainly and mark the claim
**UNSOURCED**. An honest gap outranks a confident guess.

**WHY THIS EXISTS.** The evidence is written into the law so it cannot be argued
away later. Each of these cost the founder time on a project already behind
schedule, and each was avoidable by a single fetch.

- A 39 percent click-through figure was quoted from search results and traced
  back to link-shortener vendors' own marketing, with no method, no sample and no
  date. It was withdrawn.
- The payment statement descriptor was designed twice from assumption and was
  wrong both times. Eventbrite's own help centre publishes `EB *CORGI FESTIVAL
  202`: a TWO character prefix, and the EVENT name as the suffix, not the
  organiser name. Ninety seconds of research produced a materially better design
  than the guess.
- A CLI was said to be unable to set environment values non-interactively, from a
  stale repo note. **The tool was the VERCEL CLI, not Stripe**, and the note is
  still in the tree at `docs/roast/guidance-and-guides-2026-07-26.md:227` and
  `docs/verification/launch-blockers-2026-07-25.md:44`. It is wrong: the
  documented non-interactive path is piping the value on stdin,
  `cat file | vercel env update NAME preview`
  (https://vercel.com/docs/cli/env, fetched 2026-08-09). A `--value` flag was
  also claimed for this; it does not appear on that page, so that specific detail
  is **UNSOURCED** until someone produces the page that carries it.
- The Vercel logs were assumed to record query strings. They do not, which was
  only established by calibrating against a known positive. An assumption about
  an observability tool is still an assumption.
- Instagram's tall aspect bound and the minimum resolution for a 4:5 asset were
  both taken from memory or from secondary guides. **This one shows the law is
  not a formality, because two Meta surfaces publish different answers and a
  citation is the only way to tell which one governs.** Meta's Instagram Graph
  API publishing reference states a range of "4:5 to 1.91:1", a minimum width of
  320, and a MAXIMUM width of 1440
  (https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media,
  fetched 2026-08-09). The taller 3:4 feed post is an in-app Instagram behaviour
  and belongs to a different surface, and the `1440x1800` minimum attributed to
  Meta for a 4:5 asset does not appear on the page above. Both remain
  **UNSOURCED** here until the page that publishes them is cited. Do not resolve
  a conflict like this by choosing the answer that suits the build.

**ENFORCEMENT**, because a law with no enforcement is a preference.

A build-failing guard cannot judge prose, and pretending otherwise would produce
a gate that fires on every number in the repository and gets switched off. What
it CAN judge is whether a third-party specification carries its source. So:

`scripts/guards/sourced-specifications.mjs` (registered in `run-guards.mjs`,
therefore blocking on `prebuild`) fails the build when a line asserts an EXTERNAL
platform specification, a pixel dimension pair or an aspect ratio within reach of
a named third party, and carries neither a URL nor the word `UNSOURCED`. It is
deliberately scoped to third-party claims, which is where every incident above
came from, rather than to every numeral in the tree.

The guard prints its reviewed baseline on every run, and reports baseline entries
that no longer match anything, so the allowlist cannot rot into an unexamined
list.

## Law 8: authorship, the founder is the sole author (founder ruling 2026-08-09)

**No commit on this project carries a `Co-Authored-By` trailer naming Claude, an
AI model, or any tool.** No commit message contains "Generated with Claude Code",
"Co-Authored-By: Claude", a robot emoji, or any similar attribution. Lawal Adams
is the author of this work and the commit history must say so and only so.

This is not a preference and it is not negotiable.

**This law overrides the tooling default.** Claude Code's own harness instructs
the agent to append `Co-Authored-By: Claude ...` to every commit message. That
instruction is superseded here. Where the harness and this constitution conflict,
this file wins, and an agent that appends the trailer has broken a law rather than
followed a convention.

**ENFORCEMENT, two layers, because one can be bypassed.**

1. **`.githooks/commit-msg`** rejects the message before it becomes history,
   which is the only point at which a rejection is free. It refuses any message
   containing a `Co-Authored-By` line naming Claude, Anthropic, an AI or a bot,
   the phrase "Generated with", or a robot emoji.

   The hook lives in the repository, but `core.hooksPath` is LOCAL CONFIG and is
   not committed, so it must be set once per repository:

   ```
   git config core.hooksPath .githooks
   ```

   This repository uses git worktrees, and linked worktrees share the main
   repository's config, so setting it once covers all nine
   (`git worktree list` to see them, and note one lives at `C:/elrel`, outside
   the project folder). A separate CLONE does not share that config:
   `eventlinqs-organiser-engine` is a separate clone and needs the command run in
   it as well.

2. **`scripts/guards/no-ai-authorship.mjs`**, registered in `run-guards.mjs` and
   therefore blocking on `prebuild`, reads recent commit messages and fails the
   build if any carries such a trailer. This catches a hook that was bypassed with
   `--no-verify`, or a checkout where `core.hooksPath` was never set.

   **The guard is bounded to commits from the effective date of this law**
   (2026-08-09) rather than to all history, and the reason is recorded here so it
   is not mistaken for laziness: 705 of the 1351 reachable commits already carry
   the trailer, and the founder has explicitly NOT authorised the history rewrite
   that would remove them. An unbounded guard would fail every build until that
   rewrite ran, which would block the launch it is meant to protect, and a gate
   that cannot go green is a gate somebody switches off. The boundary is a single
   named constant in the guard and is deleted the day the rewrite lands.

**The history is a separate job and is NOT authorised.** Rewriting it invalidates
every SHA quoted in every handover document, forces a force-push, and requires
every worktree to be reset. The runbook is written and waiting at
`docs/roast/AUTHORSHIP-HISTORY-REWRITE.md`. The founder decides when it runs, and
it will be after launch.

## Law 9: current by default, never backwards (founder ruling 2026-08-13)

**No runtime, dependency, platform setting, API version or framework target is
ever pinned to, left on, or moved to a version that is deprecated, end of life,
or superseded, unless the founder rules otherwise in writing for a named
reason.** The platform moves forward.

1. **VERIFY SUPPORT STATUS FROM THE PRIMARY SOURCE BEFORE PINNING ANYTHING.** A
   version number in this repository is a CLAIM about what is currently
   supported, and it goes stale silently: nothing about the file changes on the
   day the claim stops being true. Fetch the vendor's own release schedule or
   deprecation notice and cite it beside the pin. This is Law 7 applied to
   versions, and it binds identically.
2. **NEVER RESOLVE A VERSION MISMATCH BY DOWNGRADING.** When two environments
   disagree, bring the OLDER one forward. Aligning downwards is a regression
   wearing discipline's clothes: it produces a tidy, consistent, uniformly
   obsolete platform and reads in a report as though something was fixed.
3. **THE VERSION CONTRACT LIVES IN VERSION CONTROL, NOT IN A DASHBOARD.** A
   setting nobody can diff is a setting nobody can review, and it cannot
   disagree with the repository loudly enough to be noticed.
4. **A STALE PIN IS A DEFECT, NOT A NEUTRAL FACT.** Finding one and following it
   obediently is the defect propagating through one more session. Report it.

**WHY THIS EXISTS.** The evidence is written into the law so it cannot be argued
away later. Every one of these signals was visible for months and none was acted
on, because each looked like somebody else's decision already made.

- `.nvmrc` pinned Node **20** while Vercel built this project on **24.x** from a
  dashboard setting, and **Vercel never reads `.nvmrc`**. The two disagreed for
  months with nothing anywhere able to notice, because they are read by different
  systems and neither can see the other.
- A THIRD disagreement existed, unreported: `.github/workflows/env-locks.yml` was
  already pinned to `node-version: 24` while `.nvmrc` said 20, so two CI
  workflows in the same repository ran different Node majors from each other.
  Pinning ABOVE the contract was legal, so nothing complained.
- `lighthouse@13.1.0` declares `node >=22.19` and emitted `EBADENGINE` on the
  pinned runtime, on every install, in plain view.
- When the move was finally made, Node 24 turned out to be **strictly better**:
  5 test failures against 6 on Node 20, on the same tree, with one test passing
  on 24 that failed on 20. The fear that a newer runtime would cost stability was
  exactly backwards.
- **The near miss, which is the reason this is a law rather than a note:** the
  proposal on the table was to align Vercel DOWN to 20 to resolve the mismatch.
  That would have been executed as a tidy fix, would have passed every gate, and
  would have moved the whole platform onto a runtime heading out of support.

**ENFORCEMENT.** `scripts/guards/no-deprecated-runtime.mjs`, registered in
`run-guards.mjs` and therefore blocking on `prebuild`, fails the build when the
pinned Node major is not a currently supported release. It carries the support
horizon as a named constant with its source URL and the date the claim was last
checked, so a reader can see how fresh the claim is instead of trusting it, and
it says in its own header what it cannot see: the runtime only, never every
dependency's support status. That remainder is enforced by clause 1 and by
reading `npm install` output rather than scrolling past it.

## Scene layer (locked, national) - V2, research-backed

Scenes are the EventLinqs differentiator layered on top of the general
catalogue. Two families in ONE scrollable rail, music and sound first (the
dominant festival + streaming demand; Australia is the world's top dance-music
streaming nation), then community and culture.

Music and sound scenes, in this order:

1. Electronic & Dance
2. Country
3. Indie & Rock
4. Hip-Hop & RnB
5. Pop
6. Folk & Acoustic
7. Blues & Roots
8. Afrobeats & Amapiano
9. Latin
10. Caribbean & Dancehall
11. Jazz & Soul
12. Metal & Hardcore

Then community and culture scenes:

13. First Nations
14. South Asian
15. Asian
16. Pasifika & Maori
17. Mediterranean
18. Pride
19. Faith & Worship

Each tile links to its landing route where one exists, otherwise the filtered
events view as an interim. Missing scene landing pages are tracked for the
post-photos taxonomy mission. Business & Networking is a general category,
never a scene.

### Homepage community moat (split, locked)

On the homepage the two V2 families are SPLIT into two rails, not one:

- **Sounds rail** (`sounds-rail.tsx`): the 12 genres only, mid-page, normal ink
  divider. Genres link to the interim `/events?q=` view (resolves 200).
- **Find your community rail** (`community-rail.tsx`): the heritage COMMUNITIES,
  placed HIGH (within the first two screens), gold-accent top divider. It sources
  the 21 canonical heritages from `getCultureIndexEntries()` (heritageOrder, so
  Aboriginal & Torres Strait Islander leads - First Nations first, per law) and
  each tile links to its REAL `/culture/[slug]` landing (never an interim search).
- Plus a Communities doorway tile in Browse by Category -> `/cultures`, and ONE
  tinted community value band (`community-value-band.tsx`) carrying the locked
  tagline and community tiles into `/culture/[slug]`, with a CTA to `/cultures`.

Community presence is ~10-20% of the homepage and visible within the first two
screens, but the general catalogue still leads and still stands alone if the
community layer is stripped. Never a culture-wall. Community-first language only.

### Intersection pages (culture-by-city) - imagery + editorial law (locked)

The `/culture/[culture]/[city]` pages (21 communities x cities = 271+) are
TEMPLATE pages that INHERIT spine imagery - they do NOT get per-page photography:

- Imagery resolves through the media library with branded fallbacks, in this
  order: city photo (city set) -> community photo (scene/culture set) -> bundled
  raster -> navy/gold gradient. There is NEVER a broken image, even before the
  full photo spine lands. (Verified: `getCityHeroPhoto` -> `getCultureHeroPhoto`
  with `allowBundledFallback` in `src/app/culture/[culture]/[city]/page.tsx`.)
- Zero-event intersections render the shared designed empty state
  (`CategoryHeroEmpty`: "the first ... could be yours" + organiser CTA), never a
  bare "no results". The same shared empty state backs every community, city, and
  category zero-event page. Build empty states once, shared - never per page.
- Hand-crafted editorial imagery is reserved for TOP intersections AFTER launch.
  Until then every intersection is template-resolved spine imagery. Do not block
  launch on per-intersection photography.

## Design system

Inherit exactly. No new colours, sizes, or type. The source of truth for every
token and pattern is the running code: `src/app/globals.css` (the tokens) and
`src/app/page.tsx` (the homepage patterns). The hexes named below are the law's
shorthand; the token in `globals.css` is the binding value. Where a value here
and the token differ, the token wins and the discrepancy is reported, never
silently re-painted.

**Colour**

- Navy `#0A1628` and gold. Light and airy. No heavy black bands.
- Gold has tiers for contrast (`globals.css`): `--brand-accent` (gold-400) on
  dark surfaces and for focus rings only; `--brand-accent-strong` (gold-800) for
  gold text on light surfaces (gold-400 fails 4.5:1 on white). Never paint
  gold-400 as text or a fill on a light card body.
- No new colours. The off-brand navies and blues swept out of the codebase
  (`#1A1A2E`, `#2d2d4a`, `#4A90D9`, `#10B981`, `#F0F6FF`) are banned; map any
  recurrence to the brand tokens.

**Type**

- Archivo display, Hanken Grotesk body, Manrope UI (the live stack in
  `globals.css`: `--font-headline` Archivo, `--font-body` Hanken, `--font-display`
  Manrope). DICE typography influence only, never resemble DICE.
- Rail and section headings sit at the measured competitor scale:
  `.type-rail-heading` 24px at 1440, 22px at 390, weight 700. Never `.type-h2`
  (40px) for a rail heading - that is about 1.7x the bar. Card titles 18px.
  Oversizing headings is a defect; match the measured scale.

**Spacing and container**

- Reference the 4px-based spacing tokens; never eyeball spacing.
- The sitewide content container is **1400px** (`max-w-7xl`, overridden via
  `--container-7xl: 87.5rem` in the `:root` block of `globals.css`). `max-w-7xl`
  is the canonical cap on every surface (header, footer, heroes, rails, content,
  checkout, event detail) so one token aligns them all. Never hand-pick a
  section max-width. If 1400 ever changes, re-derive it from fresh live TM + EB
  captures (the derivation lives in the `page-build` skill), never from taste.

**Cards and tiles**

- Image alone, all details below the image. Never text on a card image. The hero
  is the only place text sits on an image, and only restrained. The single
  allowed on-photo overlay is a place name on a darkened-gradient band on
  city/venue tiles, one line of identity only.
- Uniform card dimensions within a rail; no feature-card size mixing in a
  category rail.

**Rails**

- CAPS headings, one faint divider per rail (`border-t border-ink-200`,
  identical on every rail), tight spacing. The detailed locked rail and glide
  contract lives in the `page-build` skill (Rail standard, Glide standard);
  `src/components/ui/snap-rail.tsx` is the single source for the behaviour.
- Rail scroll controls follow the Rail Control System (locked, derived from live
  competitor evidence in `docs/benchmark/rail-controls/CATALOGUE.md`; full law in
  the `page-build` skill): solid opaque circular arrows >= 44px, navy idle with
  gold-on-hover, anchored top-right of the rail header (structurally stable at
  every viewport and on resize), a muted disabled state at either end, reachable
  on mobile on top of native swipe, and NO progress dot/bar (removed - the gold
  standard shows arrows alone). The one control is `RailArrows` in
  `snap-rail.tsx`; never re-roll rail buttons per surface.

**Light and airy: no glassmorphism, no flat-dark (founder-locked boundary)**

- Surfaces are solid and opaque. No glassmorphism anywhere: no `backdrop-filter`
  / `backdrop-blur` chrome. Both competitors use solid headers, filter bars, and
  badges; so do we. Translucency without a backdrop-filter (a `/95` badge) is not
  glassmorphism and is allowed.
- No flat painted dark backgrounds. Every surface is the light navy-on-canvas
  homepage system. The boundary: darkness from a PHOTOGRAPH + navy overlay (the
  hero pattern) stays; darkness from a FLAT painted surface gets rebuilt to
  light. Checkout and order confirmation are light canvas.

**Chrome consistency**

- The header and footer are shared chrome with a single source each. The header
  is a solid-navy dual-state bar (State A: transparent base + top-to-fade navy
  gradient over a hero; State B: solid navy `#0A1628` + gold accent border), no
  blur, no glassmorphism. The footer is the founder-spec 4-column desktop / 2x2
  mobile layout carrying the community and organiser entry points. A chrome
  change is made once, in the shared component, and verified on a hero-bearing
  and a no-hero route.

**Hero and LCP integrity**

- The above-fold hero is a single priority AVIF raster that owns the LCP. It
  never animates (only the hero CONTENT staggers in; the image does not).
- Rails must not carry static `scroll-snap-type`. Static snap re-snaps on lazy
  image load and fires browser scrolls that stop Chrome's LCP recording before
  the hero paints (root cause of the homepage/culture NO_LCP). Snap is armed on
  the user's first engagement with the rail, inside `snap-rail.tsx`
  (`cancelGlide`) and the `DragRail` `snap` prop. Do not move snap back into the
  static className; a guard comment marks this in the file.

**Hero scale (ONE platform standard - founder ruling 2026-06-07, raised 2026-07-07)**

- ONE hero scale for the whole platform: the homepage hero scale, defined as the
  single `.hero-marketing` token in `globals.css`. Founder ruling 2026-07-07
  raised it ~25% so heroes read taller and stop cropping subjects: 52vh base /
  55vh sm / 60vh lg, max 600px, min 400px (was ~42-48vh, max 480px, min 320px).
  EVERY page hero uses it - marketing, discovery, AND content
  (`/events/[slug]`, `/city/[slug]`, `/city/[slug]/[suburb]`,
  `/categories/[slug]`, `/community/[community]`). The two profile heroes
  (venue, organiser) keep their own inline scale but were raised the same ~25%.
  There is no separate, taller "content" tier; `.hero-content` was retired.
- Deviation above this scale is permitted ONLY where FRESH competitor evidence
  proves the equivalent page type runs taller and reads better - evidence, never
  taste. The 2026 mirror (`docs/benchmark/competitor-2026/`) found neither
  Ticketmaster nor Eventbrite runs a taller hero on any page type (event detail,
  browse, category and city all sit at or below this scale), so no page
  currently qualifies. Any new taller hero must ship its competitor capture.
- Every hero shares one treatment: the bottom-up navy scrim, a GOLD eyebrow
  (`--brand-accent` on the dark hero, never a white eyebrow), the homepage
  display scale (`text-3xl sm:text-4xl lg:text-5xl`, never `text-6xl`/`text-7xl`),
  and a bottom-anchored CTA stack. A full-viewport hero (`*vh` at/above the
  tier cap), a white eyebrow, or oversized display type is a defect, fixed in
  the same pass.
- The header over any hero is the shared dual-state navy bar (Chrome
  consistency above), never a per-page header variant.

## Motion

The law: the motion engine is CSS-first - IntersectionObserver-driven reveals
plus CSS keyframes and transitions, 150 to 300ms, ease-out,
`prefers-reduced-motion` always honoured. Framer Motion is not a default
dependency; reach for it only with founder approval for a single component that
genuinely needs orchestration the CSS engine cannot express. Speed is part of
the design: Lighthouse 95+ on mobile remains law, so motion never costs the
gate (it arms only under `html[data-motion="1"]`, set pre-paint, so no-JS,
reduced-motion, and headless audit agents see the final state from first paint).

Motion reads premium and almost invisible: Ticketmaster restraint, never showy.
The bar is alive and breathing, best in the world. Motion is FELT, not watched:
tune it alive, never busy.

The choreography (deliver all of it with the CSS engine; the shared primitives
are `src/components/ui/reveal.tsx` and the `snap-rail.tsx` glide - reuse them,
never hand-roll per surface):

- Page entrance: hero content staggers in once (headline, meta, CTA, 60 to 80ms
  apart). The hero LCP image itself never animates (Hero and LCP integrity).
- Hero carousel auto-rotation (the homepage FeaturedHero, `FeaturedHeroClient`):
  a multi-slide hero AUTO-ADVANCES every ~6.5s with an eased opacity crossfade,
  mobile and desktop (evidence: Humanitix hero, rail-controls CATALOGUE). It
  PAUSES on hover, on touch/swipe, and while any element inside has keyboard
  focus, and resumes after; a manual move resets the timer. The pause/play
  control is NEVER visible except on keyboard focus: it is visually hidden
  (sr-only) and revealed only on focus-visible, so there is no visible playback
  chrome on the hero, ever, on any viewport (mobile or desktop). WCAG 2.2.2 stays
  satisfied: keyboard and assistive users retain the stop mechanism, hover/touch
  users get automatic pause-on-interaction, reduced-motion users get no rotation
  at all. When revealed on focus it is solid navy/gold, never glass. Indicator:
  minimal dots only (no travelling-dot device). ARMED ONLY under `html[data-motion="1"]`,
  so prefers-reduced-motion and headless audits get NO auto-rotation (manual nav
  only). LCP law: slide 0 is the server-rendered priority raster and the only
  slide in layout until rotation arms post-paint; non-first slides mount and
  lazy-load only after arming (outside the LCP window).
- Scroll reveals: every below-the-fold section fade-rises as it enters the
  viewport, cards staggered 50 to 80ms left to right, once only, subtle (12 to
  16px rise), never blocking reading.
- Hover: cards lift 2 to 4px with the shadow deepening and a 1.02 to 1.03 image
  scale at 150 to 200ms; buttons get press states; tasteful link interactions.
- Hover illumination law v2 (every event card, category tile, city tile,
  scene/sub-culture tile, platform-wide) - founder law: hover BRIGHTENS, never
  darkens ("the light shines more"). Two paired effects on top of the wrapper
  lift + image scale: (1) the IMAGE itself brightens - a subtle
  `brightness(1.07) saturate(1.08)` rise riding the scale, via `.card-media-img`
  applied on the image by every media surface; (2) the navy wash drops to a
  WHISPER at the base only (~12% navy at the bottom edge, fading to 0 by ~60% up)
  to keep brand identity and bottom-edge text legibility without dimming the
  image. Net effect is illumination, not shade - a hovered card MUST read clearly
  brighter than idle. The wash sits BELOW every scrim and label by DOM paint
  order (no z-index). One shared implementation only: `<HoverWash />`
  (`src/components/media/hover-wash.tsx`) + the `.card-media-img` class, rendered
  by the card/tile media surfaces (`EventCardMedia`, `CityTileImage`,
  `CategoryTileImage`, `SubCultureTileImage`), with both visuals defined once in
  `globals.css` (`.card-hover-wash` whisper + `.card-media-img` brighten). Never a
  per-page copy. Armed only under `html[data-motion="1"]`, so prefers-reduced-motion
  and headless audits never see it or pay for it (image filter and wash both gated).
- Rails: the eased arrow glide stays, the next-card peek invites the scroll. The
  detailed glide contract is the Glide standard in the `page-build` skill.
- Sticky header: a smooth elevation and background transition on scroll.
- Loading: designed skeletons settle into real content with zero layout shift.
  No spinners on white. Skeleton dimensions match the real content (a rail-header
  skeleton is 24px, not 40px) so the settle is zero-shift.
- `prefers-reduced-motion` disables all of it cleanly.

- Forbidden: GSAP, scroll-hijacking (Lenis), parallax overload, glassmorphism,
  glow kits (Aceternity, MagicUI), bento grids, auto-rolling carousels.

## Copy and banned content

- No em-dashes and no en-dashes, ever. Use hyphens, colons, commas, pipes.
- Australian English (-ise, -our, -re) and Australian content.
- Community-first language, never culture-first. Banned words: diaspora,
  friends-launch.
- **The word "culture" is banned everywhere, in every form (culture, cultures,
  cultural), permanently.** Not just copy: route names, file names, slugs,
  identifiers, database tables/columns, and data must all use "community". The
  community surfaces are `/communities` and `/community/[community]` (and
  `/community/[community]/[city]`); the legacy `/cultures` and `/culture/[...]`
  paths permanently redirect (301) to them so no existing link, share, or search
  index breaks. Any recurrence of "culture" in the repo is a defect; the gate is
  a zero-match grep for `culture` across `src` plus a zero-dead-link crawl.
- No exclamation marks in user-facing copy (a Tailwind `!important` modifier is
  not user-facing copy).
- No placeholder copy ("Coming soon", "Sample Event 1", "Lorem ipsum") on any
  shipped surface (Law 1).

## Fee system (one source, founder-controlled)

The platform fee is a single authoritative value the founder controls from the
admin panel, propagating identically to checkout, payout, and every display.
Full law and the end-to-end proof live in `docs/FEE-SYSTEM.md`. The binding
rules:

- **One source.** `public.pricing_rules` is the ONLY place a fee value lives.
  Charge (`PaymentCalculator`), payout (`application-fee` /
  `createDestinationCharge`), and display (`getLivePublicFee`) all read it
  through the ONE resolver `getPricingRule` (`src/lib/payments/pricing-rules.ts`),
  so the displayed fee always equals the charged fee. Never hardcode a fee number
  anywhere (copy included); use the live value or neutral phrasing. The
  `public-fee.ts` constant is a LAST-RESORT fallback used only when the DB is
  unreachable, and it is not a second source of the fee.
- **Three scopes, clear precedence:** per-event (highest) > per-organiser >
  region/global default. The resolver applies the most specific matching rule and
  guards every lower level with `event_id IS NULL` so scopes never collide. Both
  percentage and fixed are independently scoped.
- **Versioned + audit-logged.** Every change is an append-only new-version row
  (past orders keep their historical fee) recorded in the admin audit log with
  who and when. Set fees in `/admin/pricing`; no code deploy needed.

### Locked fee structure (2026, do not relitigate)

The final, decided fee model, sourced from `docs/EventLinqs-Fee-Structure-LOCKED.md`
(researched against Eventbrite, Humanitix, Ticketmaster, Ticketek). Built through
the single-source fee system above; the values live in `pricing_rules` and are
admin-editable. Do not reopen the numbers; tune only in admin if real data warrants.

- **ONE fee on every PAID ticket** (founder ruling 15 August 2026). Card
  processing comes out of it; there is no second fee and no processing line.
  **The rate is NOT written here.** It lives in exactly one place, the
  PRICING-LOCK block in `docs/PRICING.md`, and every surface derives it through
  `getLivePublicFee` / `getPricingRule`. This bullet used to carry the two rates
  as literals, which is precisely how the deleted fee outlived its deletion.
  POSITIONING: the 5 July 2026 rule "NEVER claim to be cheaper than Humanitix
  all-in" was correct under the two-fee model and is now OUT OF DATE, because
  deleting the second fee inverted the comparison. Whether to make a comparative
  claim is a founder decision; the sourced arithmetic is in
  `docs/EventLinqs-Fee-Structure-LOCKED.md`. The standing money story remains
  the lower headline rate, far-cheaper-than-Eventbrite, and radical fee
  transparency (published rates, all-in at first click, the live payout
  calculator).
- **Free events are free.** `$0`, no fees, same as every competitor. The
  calculator short-circuits a zero-subtotal cart before any fee is applied.
- **Admin-editable, no code change.** The percentage AND the flat amount are
  edited by the founder in `/admin/pricing` (region defaults plus per-organiser /
  per-event overrides), persisted as the single source the checkout reads. The
  processing-fee amount fields were REMOVED from that screen on 15 August 2026:
  nothing read them, so they accepted a number, versioned it, audit-logged it and
  charged nobody a cent of it.
- **ACCC all-in display (Australian Consumer Law, drip-pricing).** The true
  all-in total is shown to the buyer CLEARLY and EARLY, as a single total figure,
  on the ticket-selection surface, never sprung only at the final checkout step.
  Unavoidable fees are surfaced up front via the shared pure fee math
  (`src/lib/payments/fee-math.ts`, used by both the server `PaymentCalculator` and
  the client display, so the shown total can never diverge from the charged total).
- **Absorb or pass-on, pass-on default.** Per-event organiser toggle
  (`events.fee_pass_type`): PASS-ON (buyer pays the fee, organiser keeps full
  face value) is the default; ABSORB deducts the fee from the organiser payout.
  Both modes route through the proven funds-holding payout math unchanged.
- **GST posture (limited collection agent).** EventLinqs is the organiser's
  limited payment collection agent: the ORGANISER is the seller and remits GST on
  the ticket price. EventLinqs deals with GST only on its OWN fee, and only once
  GST-registered (turnover over $75k). Do NOT add 10% GST to the EventLinqs fee
  until registered; the ticket face value and the fee are treated GST-inclusive,
  so no separate GST line is added to the buyer total.
- **Launch baseline:** the AU rate lives in the PRICING-LOCK block in
  `docs/PRICING.md` and in `pricing_rules`, written by a lawful migration so the
  documented fee and the live value match (`public-fee.ts` is the last-resort
  fallback and is kept in sync). No migration was needed to delete the second
  fee: nothing reads those rows any more, so they are inert history.
<!-- ONE-FEE-ALLOW-BEGIN: describes the guards and what they catch. -->
- **The fee is written down in ONE place and derived everywhere else.** Six locks
  hold it, listed in `docs/PRICING.md` section 8. Two of them were added on
  15 August 2026 after the deleted fee was found alive in about twenty surfaces:
  `scripts/pricing-derive.mjs --check`, which recomputes every worked figure in
  the authority document from the lock block, and
  `scripts/guards/one-fee-copy.mjs`, which fails the build if any
  customer-facing surface names a second fee. Assistants resolve the fee live per
  request and are forbidden from quoting a figure at all when that lookup fails.
<!-- ONE-FEE-ALLOW-END -->

## Venue Revenue Sharing Program: REMOVED (founder decision 2026-07-05)

The programme (venues earning about 20% of the EventLinqs platform fee on
tickets sold at their venue) was removed entirely by founder decision on
5 July 2026. Standard ticketing economics apply platform-wide: the
organiser receives face value, EventLinqs keeps its full fee, and no
partner share is deducted from the margin or promised anywhere. What was
done: the single-source rate rows in pricing_rules were ended
(effective_until, migration 20260705000005, history preserved), the
accrual and refund-reversal call sites were removed from the Stripe
webhook, the venue disbursement leg was removed from the event
disbursement cron, the organiser venue-revenue dashboard page and sidebar
entry were removed, and the admin venues surface now records the decision.
The historical ledger tables and the dormant libraries
(`src/lib/payments/venue-share.ts`, `venue-transfer.ts`,
`src/lib/venues/`) remain untouched as history. Venue RECORDS are
unaffected: venues still power seating charts and event locations.
`docs/EventLinqs-Venue-Revenue-Program-SPEC.md` is historical and no
longer binding. Do not rebuild any revenue share without a new founder
decision.

## Verification and gates

Verify-first is law: before any task, state how the result will be verified, and
confirm against the real environment, never assumption. The `docs/benchmark/
system-pass/REPORT.md` is the running source of truth for the system-pass; read
the relevant surface section before reworking it.

**Per-page production-readiness**

- Benchmark gate on every page: a Playwright side-by-side against the competitor
  equivalent in `docs/design/competitor-page-specs.md`, with an explicit
  SURPASS / PARITY / BELOW verdict per aspect (density, typography, imagery, UX,
  motion, loading, mobile). Parity is the floor; the goal is to surpass. Any
  BELOW means iterate before delivering.
- Density-proof: every benchmark capture and verdict is taken at full fixture
  density (`HOMEPAGE_SEED_FIXTURE=1`), every rail populated. A thin-rail
  screenshot flatters the layout and is not evidence.
- Visual changes: Playwright before and after at 1440, 768, and 390.
- Lighthouse 95+ on desktop AND mobile, measured as a median of repeated runs on
  the Vercel preview or warmed production, never a single localhost run.
- axe-core 0 violations. Touch targets 44px or larger.
- Zero dead links on any discovery or navigation surface (Law 5): run the
  link-integrity crawler and confirm 0 non-200.

**Migrations**

- Write the migration file only. Lawal applies it with `supabase db push
  --linked` in PowerShell. Never the Dashboard SQL editor, never the Supabase
  MCP. Verify applied migrations by a direct database query, not the cached
  client (its schema cache lags).

**Dependency bumps on a user-content path (locked 2026-08-08)**

A dependency that processes user-supplied bytes is verified against the
**actually installed package, with a real file**, never against a lockfile diff,
a changelog, `npm audit`, or a mock. This is law because all four of those passed
while a real regression sat in the diff.

The case that set it: `sharp` was bumped 0.34.5 to 0.35.3 to clear libvips CVEs
reachable from organiser uploads (`src/lib/upload.ts` hands user `File` bytes
straight to a native decoder). 0.35 removed `avif` from `FormatEnum` and reports
AVIF as `heif`, because AVIF is a HEIF-family container. The pipeline branched on
`format === 'avif'`, so that branch went dead, and **every AVIF cover an
organiser uploaded would have been silently transcoded to JPEG** on a platform
that deliberately serves AVIF for LCP. `npm audit` was green. The types only
half-revealed it. No mock could reveal it, because the change was in what the
library actually reports.

So, for any bump to a package on a user-content path (image, video, document,
archive, parser, codec):

1. **Install it for real** and confirm the resolved version on disk. A lockfile
   entry is an intention, the installed tree is the fact. Check for nested copies:
   a framework can pin its own older copy that the top-level bump does not lift.
2. **Round-trip a real artefact** of every format the surface accepts, through
   the real code path, and assert the OUTPUT, not the call. Where a format cannot
   be produced locally (HEIC has no encoder in libvips), pin the decision in a
   pure function and test that exhaustively instead.
3. **Assert the library's own reported shape**, so the next release that changes
   it fails loudly here rather than quietly in production.
4. **Prove the delivery path still delivers.** For imagery that means the
   optimiser actually returns AVIF and WebP for the matching `Accept`, since that
   path owns the LCP.

The executable form of this law is `tests/unit/security/image-pipeline-format.test.ts`.

**Delivery**

- CI gates are the merge authority. No `--admin`, no skipping gates, never lower
  a threshold or mark a check optional to go green.
- Commit per unit with a clear message, push, hand back the Vercel preview URL
  with the benchmark verdict. Never merge without approval.
- Disk guard: check free space before any build or deploy step. Under 5 GB
  free, stop and report. The executable authority is `scripts/check-disk-space.mjs`
  (`MIN_FREE_GB`), which runs before a local build; this line follows it. The
  floor is 5 GB rather than something smaller because a Next.js build writes
  gigabytes of `.next` output and fails MID-COMPILE on a near-full disk with
  "os error 112", leaving broken routes that read as code bugs. Emergency
  bypass is `ALLOW_LOW_DISK=1`, and it is a bypass, not a lower floor.

**The gates: what is machine-checked (and the known gaps)**

This is the coverage map of every law that can be machine-checked. A law without
a green gate is enforced by hand until its gate is wired; the gaps below are
named and routed, never hidden.

| Gate | File | Enforces | State |
|---|---|---|---|
| CI: lint / typecheck / build / test | `.github/workflows/ci.yml` | code correctness, type safety, build integrity, unit tests (vitest) | Blocking on PRs to main. (`types-drift guard` is non-blocking until `SUPABASE_ACCESS_TOKEN` is set.) |
| Lighthouse CI | `.github/workflows/lighthouse.yml` + `lighthouserc.json` | performance, accessibility (category), best-practices, SEO, CLS on the public URL set | Blocking, but BELOW the law - see gaps. |
| axe-core | `scripts/axe-*.mjs` (incl `axe-marketing-scan.mjs`) | accessibility 0 violations (WCAG 2 A/AA) | NOT a CI job yet - run by hand per surface. |
| Link-integrity crawler | `scripts/link-integrity-crawl.mjs` | Law 5, zero dead links | NOT a CI job yet - run by hand vs preview/local. |
| Post-deploy smoke | `.github/workflows/post-deploy-smoke.yml` | production homepage 200 + no error-boundary HTML after deploy | Blocking on main after CI. |

Known gate gaps (routed to the engine-hardening branch; founder ruling needed on
the first):

1. **Lighthouse vs the law (workshop inspection MAJOR-1).** The gate runs against
   `localhost:3000`, not the preview/warmed-prod the law requires; floors perf at
   0.80 not 0.95; runs perf at warn-level on `/` and `/culture/*` (the hero
   pages); is mobile-only (no desktop); leaves LCP/TBT/FCP/Speed-Index at warn.
   Either the 95+ law is amended with founder sign-off to the operating reality,
   or the gate is brought up to the law. Tied to Issue #42 (next/image optimiser
   cold-start) driving the LCP/perf variance.
2. **axe and the link crawler are not CI jobs.** Both exist and pass when run;
   wiring them as blocking CI gates makes the accessibility and zero-dead-links
   laws unskippable. Routed to engine hardening.
3. **Marketing/legal pages are not in the gate URL list (MAJOR-4).** `/about`,
   `/blog`, `/careers`, `/press`, `/legal/privacy` are outside the Lighthouse +
   axe URL set, so contrast and markup regressions there slip the gate. Add them.
4. **Copy laws are cheaply grep-checkable.** No em/en-dashes, no exclamation
   marks, no banned words, no placeholder strings - a CI grep gate would make
   these unskippable. Opportunity, routed to engine hardening.

Laws that are not machine-checkable and stay human/benchmark-enforced: Law 1 (no
generic), Law 2 (evidence-driven Phase A/B), Law 3 (Australia-smart taxonomy),
Law 4 (image-richness judgement), the light-and-airy palette, and the benchmark
SURPASS/PARITY/BELOW verdicts.

## Tooling

- UI primitives: shadcn and Radix, for accessibility. Icons: Lucide. Rails:
  native CSS scroll-snap (armed on first interaction, per Hero and LCP
  integrity).
- Media: all imagery flows through the media components (`EventCardMedia`,
  `HeroMedia`, `CityTileImage`, `OrganiserAvatar`, `MarketingMedia`). No raw
  `<img>`, no `background-image` for content, no `next/image` in feature code.
  Follow `docs/MEDIA-ARCHITECTURE.md`.
- No new UI libraries without founder approval.

## Launch sequence and parked workstreams (locked 2026-06-21)

The authoritative plan is `docs/EventLinqs-Launch-Plan-Handoff.md` (Lawal approved,
21 June 2026); this section is its binding summary. The repo is the source of
truth, not memory.

**The three branches and the integration.** `feat/home-rebuild` is the CONFIRMED
final design (approved; do not change it, only make it work). `feat/funds-holding-
payments` is the proven funds-holding re-platform (EventLinqs is the merchant of
record, holds funds, and pays the organiser after the event, with reserve, refund
and dispute proven across 16 of 16 Stripe TEST surfaces; five TEST-only migrations
20260621000001 to 000005). The home-rebuild design is already contained in
`release/launch-line` (verified: zero design-file changes on top of it), and the
payments branch fast-forwards onto it with no conflicts. The unified launch line
is `release/launch-line`. Never merge to `main` or production without sign-off.

**Launch-blocker changes (must ship on the unified line, each verified A to Z).**
- About Us in the HEADER, after the EVENTLINQS logo (the footer About Us stays).
- Rename the header "For Organisers" to "EVENT ORGANISERS".
- Fix the image-upload defect: the image must appear IMMEDIATELY on upload (not
  only after publish) and must not falsely crop; verify the full organiser flow A
  to Z (sign-up, create event, upload photos, set up, payment/payout, go live).
- Community into event creation: REMOVE the header "Communities" tab; organisers
  tag an event to one, several, or all communities using the locked Scenes V2
  taxonomy (Sounds + Communities families); every community-discovery surface
  reads from those tags. Do not change the community pages' look, only what feeds
  them.
- Integrated admin access from a single login (role-based): a logged-in user with
  the founder/admin role sees an "Admin" entry in the in-platform account menu (no
  separate URL to remember); users without the role never see it and cannot reach
  it. The menu item is convenience ONLY: every admin route and privileged action
  stays enforced server-side by role check PLUS 2FA, never weakened. Build the role
  system so scoped staff roles can be granted later WITHOUT a rebuild (founder =
  full). Inherit the approved header/account-menu design exactly.
- Logo finalise and final polish. No design changes.

**PARKED, substance first (footer only, future).** The global community-support
statement is built ONLY after the real donation/partnership programme exists (an
audited model like Humanitix's). A public claim that cannot be substantiated risks
Australian consumer-law scrutiny. Understated, never bold, never in the design.

**PARKED, the NEXT major workstream (post-launch, do not forget).** The agentic
growth engine and AI operating system: lead-generation funnels for organisers and
event-goers, super-agent sales/marketing automation, an organic/SEO plus web-push
plus email lifecycle engine (ties to `docs/MOAT-DEMAND-ENGINE-PLAN.md`), and a
Higgsfield-based EventLinqs creative-skill set (navy/gold, hook framing) for hero
images, launch videos, and social/YouTube content. Built AFTER launch, on top of a
live, earning platform with real traffic and data, never before: building
automations to capture a market for a platform that is not yet live and earning is
the wrong order. Strong yes to the vision, firm not-yet on timing.

**The Higgsfield boundary (founder ruling 2026-08-08), so this is never read as
permission.** That creative skill set is for EventLinqs' OWN marketing only:
the platform's hero rasters, its launch videos, its social content. It never
generates for an organiser's event, never renders into a Launch Kit artefact,
and never becomes a product feature. Law 6 governs the product side and is
absolute there.

**REMOVED (founder decision 2026-07-05): the Venue Revenue Sharing
Program.** Built, then removed entirely; the record lives in the Venue
Revenue Sharing Program section above. Standard ticketing economics apply.
`docs/EventLinqs-Venue-Revenue-Program-SPEC.md` is historical, not binding.

## Authority docs

- `docs/EventLinqs-Launch-Plan-Handoff.md`: the authoritative launch plan and
  carry-forward (Lawal approved 2026-06-21). The Launch sequence section above is
  its binding summary.
- `docs/EventLinqs-Fee-Structure-LOCKED.md`: the locked two-fee model. The
  "Locked fee structure" section above is its binding summary.
- `docs/EventLinqs-Venue-Revenue-Program-SPEC.md`: the parked Venue Revenue
  Sharing Program (next major build after launch-readiness + the fee structure).
- `docs/ENV-DOCTRINE.md`: AUTHORITY. The environment and secret contract: the
  four locks, the store rules, sender and destination rules, the cross-store
  handshake, and how to add or rotate a variable. `src/lib/env/manifest.mjs` and
  the guards are the executable authority; `docs/verification/ENV-STATE.md` is a
  GENERATED snapshot and is never hand-edited. Where a document and the manifest
  disagree, the manifest wins. Rotation steps live in
  `docs/security/CREDENTIAL-ROTATION.md` section 7.
- `docs/RATE-LIMIT-DOCTRINE.md`: AUTHORITY on rate limiting. What fail-open and
  fail-closed each actually do, the standing ruling that `launch-compose` stays
  fail-OPEN (and the false cost premise that reversed it once already), the
  fail-open policies that DO sit in front of a metered spend, and the rule that a
  limit is a number AND a bucket. `src/lib/rate-limit/policies.ts` is the
  executable authority and wins any disagreement;
  `scripts/verify/rate-limit-audit.mjs` reads both out of source and is the thing
  to run before stating what a policy costs.
- `docs/EventLinqs_Scope_v5.md`: scope. Build nothing that contradicts it.
- `docs/design/competitor-page-specs.md`: the per-page bar for the benchmark
  gate.
- `docs/MEDIA-ARCHITECTURE.md`: imagery and media component rules.
- `docs/benchmark/system-pass/REPORT.md`: the running source of truth for the
  system-pass surface-by-surface state.
- `docs/DESIGN-SYSTEM.md`: SUPERSEDED v2.1 historical reference. It predates the
  community-first repositioning and contradicts this constitution on the mission,
  the tagline, the font stack, and the competitor bar. Use it only for legacy
  component detail, and only where it does not conflict with this file or the
  code. This constitution and `globals.css` win on every conflict.

## Skills

- `competitor-benchmark`: the encoded competitor DNA. Hard reference facts for
  Ticketmaster and Eventbrite (hero heights per page type, rail patterns, hover
  language, auth/help/pricing layouts) plus the EventLinqs laws that beat them
  and the premium bar. Read it before designing any page; it points to the
  verified capture index. NEVER re-ask the founder what competitors look like.
- `page-build`: the standard page build. Reality audit, capture the competitor
  equivalent, Phase A mirror, Phase B EventLinqs touch, QA, benchmark, deliver.
  Holds the detailed locked specs (Rail, Container width, Glide, Motion,
  Marketing surface) that elaborate the laws above for execution.
- `seed-events`: seed realistic Australian events across all categories and
  scenes from a local image library, optimised and wired through the media
  components.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
