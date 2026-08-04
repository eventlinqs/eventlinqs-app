# Guidance and the organiser guide hub

Built 2026-07-26, verified 2026-07-27. Branch `feat/walkthrough-defects`.
Evidence: `docs/design/guidance-2026-07-26/` (24 guidance captures at 1440 and
390, plus 16 guide screenshots in `public/guides/`).
Roast ledger: `docs/roast/guidance-and-guides-2026-07-26.md`.

Two things shipped together, because they are one system: guidance inside the
product at the moment a person is stuck, and written guides they can read,
search and link to. A hint that cannot deepen into an article is a dead end; an
article nobody can find from the screen they are stuck on may as well not exist.

---

## 1. Research: how the incumbents actually teach

All figures read from the live sites on 2026-07-26 and recorded here so no
future session has to re-ask.

### 1.1 The deep help centre (Humanitix)

Fifteen collections, **283 articles**, with a search field and an Intercom
messenger. No AI assistant. Source:
[help.humanitix.com](https://help.humanitix.com/en/).

| Collection | Articles | Collection | Articles |
|---|---:|---|---:|
| Getting started | 13 | On the day | 9 |
| Event guides | 13 | Tax and payouts | 24 |
| Build and manage | 31 | Fees | 8 |
| Design and style | 21 | Account and settings | 14 |
| Discounts and comps | 8 | Payment options | 11 |
| Promote and share | 20 | Reporting | 13 |
| Manage attendees | 32 | Integrations | 12 |
| I am a ticket buyer | 54 | | |

**Taxonomy shape.** Lifecycle-ordered (start, build, promote, manage, event day,
money), with buyer-facing content walled into its own collection so an organiser
never reads a buyer article by accident. Collections subdivide: "Build and
manage" splits into General (10), Attendee Data (2), Tickets (15), Donations (2),
**Allocated Seating (2)**.

**Article shape.** Their
[complete guide to building a seating map](https://help.humanitix.com/en/articles/8905642-complete-guide-how-to-build-a-seating-map)
runs roughly 3,000 words across 14 sections, carries 15+ static screenshots plus
several animated GIFs demonstrating workflows, has a table of contents, and ends
with five related-article links. Instructional voice is procedural and literal:
"Click on the seating element and select the rotate icon that appears above it",
"Use the arrows to adjust the number of rows or the number of seats per row",
"Toggle ON hide seat or remove seat".

**In-product to article.** The link runs one way and weakly: the messenger is a
generic support entry point in the corner of the app, not anchored to the screen
you are on. Teaching happens in the article, not on the surface.

**Premise correction (recorded, not smoothed over).** The brief stated their
seating articles "run to dozens". They do not. There are **2** articles in the
Allocated Seating subcategory, and a site search for "seating" returns **10**
articles that mention seating at all. What is genuinely large is the help centre
overall. The underlying instinct was right and the target is easier than
assumed: their seating teaching is two articles deep.

### 1.2 The mass-market help centre (Eventbrite)

Two top-level categories, "Attending an event" and "Organizing an event", a
"How can we help?" search, six featured articles (find your tickets, request a
refund, contact the organizer, what is this charge, transfer tickets, edit your
order), four browse topics (Buy and register, Your tickets, Your account, Terms
and policies), and a Contact us path plus social channels. No AI assistant is
surfaced on the help home. Source:
[eventbrite.com/help/en-us](https://www.eventbrite.com/help/en-us/).

**Taxonomy shape.** Audience-first (attendee versus organiser) rather than
lifecycle-first, then task-based inside each. The home page is optimised for the
six things most people arrive needing, which is a sound piece of design: the
featured list does most of the work and the taxonomy catches the rest.

**In-product to article.** Support is a separate destination reached from
account navigation, not from the screen in question.

### 1.3 In-product hints (TryBooking)

Their [Creating seating plans](https://learn.trybooking.com/hc/en-us/articles/360002762074-Creating-seating-plans-)
article runs nine sections (introduction, creating a plan, editing and
customisation with a nine-type seat status table, adding rows manually,
multi-level venues, editing the stage, adding doors, reserving seats, related
articles). It leans heavily on animated GIFs and screenshots.

Notably, the article contains **minimal in-product tooltip text**. The
instructional language is procedural ("To create a seating plan:"), with bold
button names, italic field labels, and occasional scope notes such as "Only
available within the event. Not available in venue templates." The teaching
happens in the article; the product itself says little.

**Premise correction.** The brief cited their seat map as literally instructing
"Scroll left or right to view more seats". Four searches against public sources
returned no instance of that string, and their published seating documentation
shows the opposite pattern. It is recorded here as **unverified**. The
underlying want, a hint at the moment of confusion on a seat map, is built
anyway and is claimed as our own decision rather than as a mirror of theirs.

### 1.4 The 2026 in-product onboarding evidence

- **Tour length is the dominant variable.** Three-step tours complete at 72%;
  seven-step tours drop to 16%. ([Guideflow, product tour best practices, published 28 April 2026](https://www.guideflow.com/blog/product-tour-best-practices))
- **Most people skip linear tours entirely.** Around 70% skip them, and users
  are 123% more likely to complete a tour they started themselves than one
  launched at them (Chameleon 2019 Product Tour Benchmarks, cited by Guideflow).
- **Assistive beats interruptive.** The 2026 position is checklists, nudges,
  contextual tooltips and searchable help first, tours only where they earn it.
  ([Product Fruits, 19 February 2026](https://productfruits.com/blog/how-to-build-perfect-product-tours-in-2026))
- **Empty states are teaching surfaces.** Three jobs: communicate system status,
  provide learning cues, provide direct pathways for key tasks. Contextual help
  shown on interaction rather than pushed is a "pull revelation", which they
  define as help that appears "only when the user interacts with the
  corresponding UI element and they are not 'pushed' in any obtrusive or
  interruptive way". ([Nielsen Norman Group, Kate Kaplan, 19 September 2021](https://www.nngroup.com/articles/empty-state-interface-design/))

**What the evidence told us to build.** Not a tour. Three steps maximum,
dismissable at any point, remembered per device, never repeated, always
re-openable by the person, with the real work done by hints armed at the moment
of confusion rather than on arrival.

---

## 2. What was built

### 2.1 In-product guidance

One mount per surface (`SurfaceGuidance`), four shared pieces, nothing per page.

| Piece | What it does | Where |
|---|---|---|
| `FirstRunCoach` | Three dismissable steps, anchored in a corner so the room stays usable behind it. Never a modal. | `src/components/guidance/first-run-coach.tsx` |
| `ContextualHint` | One sentence armed by what the person just did. Spent after one showing per device. | `src/components/guidance/contextual-hint.tsx` |
| `TeachingEmptyState` | System status, what the area is for, and the path to fill it, all required props. | `src/components/guidance/teaching-empty-state.tsx` |
| `SurfaceGuidance` | The persistent launcher, the help panel, and the assistant. One element per surface. | `src/components/guidance/surface-guidance.tsx` |
| Per-device memory | `useSyncExternalStore` over localStorage, wrapped for private browsing. | `src/lib/guidance/memory.ts` |
| The registry | Every step, hint, guide link and assistant, in one auditable file. | `src/lib/guidance/registry.ts` |

**The four contextual hints, and what arms each.**

| Hint | Armed by | Surface |
|---|---|---|
| Chair already taken | Tapping a sold chair | Buyer seat map |
| Belongs to another ticket type | Tapping a chair dimmed by the ticket filter | Buyer seat map |
| You are inside the room now | Zooming past 1.25x the fit scale, the moment the room stops fitting the screen | Buyer seat map |
| Set its ticket type | The first block landing on an empty sheet | Room studio |

**Empty states that teach.** The buyer seat map previously rendered "Seats are
not yet available for this event." on a dashed box. It now says what the state
is (nothing sold out, nothing released), what the area becomes, and links the
guide. The room studio's empty sheet already invited well; it now also links its
written guide, closing the loop between surface and article.

### 2.2 The organiser guide hub

`/guides`, plus `/guides/[slug]` for each of the eight guides the brief named.

- **Evergreen, not a blog.** No dates in URLs, no reverse chronology, no feed.
  Grouped by the order the work happens: set up, seat the room, sell it, get
  paid, run the door.
- **Search over full bodies.** Server-rendered from `?q=` first, then instant on
  the client. Works with no JavaScript, is in the HTML for a crawler, and
  narrows as terms are added. A title match outranks a body mention.
- **Illustrated with the real platform.** 16 screenshots, all captured from the
  running app on TEST by `scripts/verify/guides-capture.mjs`. A unit test fails
  if any referenced capture is missing from disk, so a guide can never ship
  describing a screen it does not show.
- **Cannot drift on money.** The platform fee and the payout window are `{{fee}}`
  and `{{payoutDays}}` tokens resolved at request time through the one pricing
  resolver. No fee number is written into any guide.

### 2.3 Answer in context: the thing a help centre cannot do

A question asked on the seat map or in the studio is answered on that surface by
the platform's locked assistant, with the relevant guide attached.

Two properties make it trustworthy:

1. **The assistant id is chosen by the surface, never by the client.** The
   system prompt stays server-side in `src/lib/ai/assistants.ts`. The buyer seat
   map uses `support` (works signed out); the room studio uses
   `organiser-onboarding`. Asserted by test.
2. **The guide link is deterministic.** It comes from the guidance registry, not
   from the model, so the citation under an answer can never be hallucinated.
   That is the usual failure mode of an assistant that cites documentation, and
   it is designed out rather than prompted against.

When the assistant layer is not configured, the ask control is not rendered at
all and the written guides take its place. No dead affordance either way.

---

## 3. What is needed to switch the assistant on

It is built and wired. It is **not on** in any environment yet, because no API
key is set. Verified by `GET /api/ai/status` returning `{"enabled":false}` on the
local production build used for these captures.

| # | Requirement | Why | How to verify |
|---|---|---|---|
| 1 | `ANTHROPIC_API_KEY` on the environment, server-side only | `isAiConfigured()` gates the whole layer. Without it the route returns `unconfigured` and the ask control never renders. | `GET /api/ai/status` returns `{"enabled":true}` |
| 2 | `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` | The `ai-chat` and `ai-chat-daily` policies are `failClosed: true` **in production**. Without Redis, every AI turn is refused in production even with a valid key. This is deliberate: each turn spends real tokens. | Ask a question on a seat map in production and get an answer rather than a throttle message |
| 3 | Optional: `AI_MODEL` | Defaults to `claude-opus-4-8` in `src/lib/ai/config.ts`. Worth a look: that id predates the Claude 5 family, so the default is probably not the model you want. | Model id in the AI logs |
| 4 | Optional: `AI_MONTHLY_BUDGET_USD` | Defaults to USD 50/month across all AI features. Once reached, assistants decline politely instead of calling the API. | Raise before launch traffic if the assistant is promoted |

Nothing else is required. Rate limits, cost guard, prompt-injection guardrails,
the human handoff and the logging are already built and unchanged by this work.

---

## 4. Comparison and verdict per area

Verdicts are against the researched incumbents, with the evidence named. Where
I did not measure something on their side, I say so instead of claiming a win.

| # | Area | Verdict | Evidence and reasoning |
|---|---|---|---|
| 1 | Help centre breadth | **BEHIND** | 8 guides plus 6 existing Help Centre topics against 283 articles in the deepest incumbent. Breadth is a volume problem and eight guides is a launch set, not a library. Named honestly; see the gaps below. |
| 2 | Seating teaching depth | **AHEAD** | Two dedicated seating guides against their two, but ours carry what theirs do not: the tier-to-seat binding is by case-insensitive **name match**, and an unmatched name still sells the seats at the event default price. That single paragraph is worth more than a chapter of button-clicking. Verified from `20260710000001_seat_reassignment_and_live_sync.sql` lines 171 to 178. |
| 3 | First-run coaching in product | **AHEAD** | No researched incumbent runs first-run coaching on a seat map or a chart builder. Ours is three steps, dismissable, per-device. Captures: `buyer-seat-map-coach-{1440,390}.png`, `room-studio-coach-{1440,390}.png`. |
| 4 | Contextual hints at the moment of confusion | **AHEAD** | Four hints armed by real interaction, none on arrival. Their documented pattern teaches in the article instead. Captures: `buyer-seat-map-hint-taken-{1440,390}.png`, `buyer-seat-map-hint-filtered-{1440,390}.png`, `room-studio-first-block-hint-1440.png`. |
| 5 | Empty states that teach | **AHEAD** | The three NN/g jobs are enforced as required props, so a blank empty state cannot be added. Captures: `room-studio-empty-state-{1440,390}.png`. |
| 6 | Persistent, unobtrusive re-open | **AHEAD** | A 44px launcher on both surfaces, always present, opening the steps, the guides and the assistant. Their equivalent is a generic support messenger with no knowledge of the screen. |
| 7 | Accessibility of guidance | **AHEAD of our own bar; no comparative claim** | 0 serious or critical axe violations across 10 surface states at 390 and 1440, and 7 of 7 keyboard assertions green (`docs/design/guidance-2026-07-26/a11y-results.json`). I did not audit incumbent accessibility, so I am not claiming to beat it. |
| 8 | Screenshot fidelity and freshness | **LEVEL** | Both sides illustrate with real screenshots. We add a capture script and a test that fails on a missing image, plus a visible "checked against the live platform" date. They add **animated GIFs**, which we do not have. Genuinely level, with a different strength each way. |
| 9 | Search | **LEVEL** | Both have search. Ours matches full body text, ranks title above body, works with no JavaScript, and is instant once hydrated. Theirs searches a much larger corpus, which matters more than our better mechanics. |
| 10 | Context-to-article linkage | **AHEAD** | Coach, hint panel, both empty states and the assistant answer all link the specific guide for that surface, and a test asserts the slug and the title match the guide library so they cannot drift apart. No researched incumbent links from the screen to the article. |
| 11 | Answer in context | **AHEAD when switched on; NOT ON today** | Built, wired to the locked assistants, with deterministic guide links. Currently degrades to the written guides because no API key is set. This is an honest AHEAD-on-capability, NOT-ON-in-fact. |
| 12 | Money accuracy over time | **AHEAD** | The fee and payout window resolve live from the pricing resolver, so the guide cannot state a fee different from the one charged. Static help centres restate numbers in prose and drift. |

**Summary: 8 AHEAD, 2 LEVEL, 1 BEHIND, 1 AHEAD-but-not-switched-on.**

---

## 5. Gaps and what I would do next

Stated plainly rather than buried.

1. **Breadth is the real gap (area 1).** Eight guides is the brief's launch set
   and it is complete, but it is not a library. The four that would most improve
   both coverage and the hub's visual balance, in order: discount codes and comp
   tickets; the attendee list and exports; moving an attendee to a different
   seat; duplicating an event for a series. Two categories currently hold a
   single guide, so a row of one card sits beside rows of two on desktop.
2. **No animated demonstrations.** Both researched incumbents use GIFs for
   multi-step manipulations (rotating a seating element, dragging rows). Static
   screenshots plus numbered steps carry it, but a short silent capture of a
   drag would beat prose for two or three specific moments in the seating
   guides.
3. **The assistant is dark.** See section 3. It is two environment variables
   away, and until then the differentiator is potential rather than fact.
4. **Lighthouse not measured on `/guides`.** The law requires 95+ measured as a
   median on a warmed preview, and this work was verified against a local
   production build. The route should be added to the Lighthouse URL set on the
   next preview deploy.
5. **Pre-existing mislabel left alone.** The footer's "Organiser guide" entry
   points at `/organisers`, which is the marketing landing, not a guide. I added
   "Step-by-step guides" pointing at `/guides` rather than renaming an existing
   entry the brief did not ask me to touch. Worth renaming later.

---

## 6. Verification run

All against a local production build on the TEST project
(`vkapkibzokmfaxqogypq`), never production.

| Gate | Result |
|---|---|
| `tsc --noEmit` | Clean |
| `eslint .` | 0 errors (48 pre-existing warnings, none in this work) |
| `vitest run` | 1019 passed, 113 files |
| `next build` | Success, `/guides` and `/guides/[slug]` both built |
| Link-integrity crawl (with `/guides` seeded) | **322 internal links, zero dead** |
| Affordance scan (with hub and guide page added) | **0 dead-end tiles across 18 pages** |
| axe-core WCAG 2 A/AA, 10 guidance states | **0 serious or critical** |
| Keyboard drive | **7 of 7 green** |
| Guide library gates | 24 assertions: copy laws (via the canonical `copy-tells.json` lexicon), cross-links, capture existence |
| Guidance registry gates | 21 assertions: surface-to-guide contract, step ceiling, copy laws |

**One real defect found and fixed by this verification.** The accessibility
drive could not click the help launcher on a phone: the platform's bottom bars
(`MobileBottomNav`, and `StickyActionBar` on event detail) both fill `bottom-0`
at `z-40` and were intercepting the tap. The launcher now follows the existing
platform convention for anything that must sit above them, `bottom-16 z-50`,
returning to `bottom-4` on desktop where those bars are hidden. Without the
keyboard drive this would have shipped as a help button no phone user could
press.

**A second defect found by the tell sweep.** Two instances of the word "unlock"
had reached the guide content, one of them in user-facing caption copy. The root
cause was mine: I had hand-rolled a tell regex in the tests instead of using the
platform's researched lexicon at `src/lib/ai/copy-tells.json`. Both test suites
now assert `findCopyTells()` over every user-facing string, so this content is
held to the same canonical list as the AI layer and grows with it.

**A third correction worth recording.** An early capture pass produced a frame
named as the contextual-hint proof that showed no hint at all: the proof room
had all 750 seats open, so no hint could fire. It was deleted and replaced with
`scripts/verify/guidance-hint-capture.mjs`, which drives the hints
deterministically against a room that genuinely has sold seats and a room with
two ticket types. An empty frame that looks like evidence is worse than no
evidence.

---

## 7. Files

**Guides:** `src/lib/guides/` (types, categories, eight guides, registry, live
values), `src/app/guides/`, `src/components/guides/`,
`src/components/media/Guide{Card,Shot}Image.tsx`.

**Guidance:** `src/lib/guidance/` (registry, memory),
`src/components/guidance/` (coach, hint, empty state, launcher panel, ask in
context), `src/app/api/ai/status/route.ts`, one keyframe in `globals.css`.

**Mounts:** `src/components/checkout/seat-selector.tsx` and
`src/app/(dashboard)/dashboard/venues/[id]/seat-maps/seat-map-builder.tsx`,
additive only. **The seat map renderer was not touched**: nothing under
`src/components/seating/` or `src/lib/seating/render/` is modified.

**Verification:** `scripts/verify/guides-capture{,-targets}.mjs`,
`scripts/verify/guidance-hint-capture.mjs`, `scripts/verify/guidance-a11y.mjs`,
plus `/guides` seeded into `scripts/link-integrity-crawl.mjs` and
`scripts/affordance-scan.mjs`.

**Tests:** `tests/unit/guides/guide-library.test.ts`,
`tests/unit/guidance/guidance-registry.test.ts`.
