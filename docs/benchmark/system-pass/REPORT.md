# System-wide pass: report

Branch: feat/home-rebuild. Density: HOMEPAGE_SEED_FIXTURE.
One surface per session, deep, stop cleanly when context runs low.

Note on artifacts: `docs/design/competitor-page-specs.md`, `design-captures/`,
and the `page-build` + `seed-events` skills landed on main (PR #82, #84) and
were merged into this branch before this surface ran. They are present and in use.

---

## Surface 0: Homepage A-class refinement - DONE

Goal: lift four finish details to the measured Ticketmaster/Eventbrite bar, no
churn, then lock the standard into the page-build skill.

### Evidence (measured live, Playwright, 1440 + 390)
- Rail/section headings: Ticketmaster 24px w700, Eventbrite 24px w700 at 1440
  (22px at 390). Ours was `type-h2` 40px / 28px, about 1.7x oversized.
- Card titles: TM 16px, EB 18px at 1440. Ours 18px - already at bar, untouched.

### Changes shipped
1. Rail-heading type scale re-derived: new `--type-rail` 24px / `--type-rail-mobile`
   22px token and `.type-rail-heading` utility; `snap-rail.tsx` headings moved off
   `type-h2`. Verified rendering: 24px at 1440, 22px at 390.
2. Identical faint top divider (`border-t border-ink-200`) added to Browse by
   Category and This Week; every rail now carries the same divider.
3. Uniform card dimensions: removed `leadFeature` from the Music rail. Every
   category rail now renders one uniform landscape card size, no feature mixing.
4. Rail glide confirmed world-class: eased arrow scroll, CSS scroll-snap, partial
   next-card peek at 1440/768/390, drag on pointer and touch, prefers-reduced-motion
   respected, no auto-rolling anywhere including the hero (manual only).
5. Locked the rail standard into `.claude/skills/page-build/SKILL.md` so every
   future surface inherits it.

### Captures
- After: `docs/benchmark/system-pass/surface-0/after/home-{1440,768,390}.png`,
  plus `after-top-1440.png` and `after-mid-1440.png` (divider + uniform-card proof).
- Before (prior state, oversized headings + Music feature card):
  `docs/benchmark/legacy-purge/after/home-1440.png`.
- Competitor reference: `design-captures/ticketmaster/homepage-*`,
  `design-captures/eventbrite/homepage-*`.

### Benchmark verdict vs Ticketmaster + Eventbrite (1440 + 390)
| Dimension | Verdict | Note |
|---|---|---|
| Typography | Parity | Rail headings now 24/22px, matching both competitors exactly. Card titles 18px at bar. |
| Density | Surpass | More distinct rails of real breadth than either competitor homepage. |
| Imagery | Parity | Real category photography in every card; image-alone, details below. |
| UX | Surpass | One consistent rail and card language; eased glide with peek and drag; manual hero. |
| Mobile (390) | Parity | Rails scroll-snap with peek; headings 22px; dividers identical. |

### Gates
typecheck 0, lint 0 errors, build pass, vitest 275 pass, axe-core 0 violations.
Lighthouse runs on the Vercel preview (CI gate).

---

## Surface 1: Header + footer [SHARED] - DONE

Goal: evidence-based refinement of the shared header and footer, no churn,
and resolve the flagged conflict that the header "uses glassmorphism" which
CLAUDE.md forbids, letting the Ticketmaster and Eventbrite evidence decide.

### Evidence (captured competitors, 1440 + 390)
- Ticketmaster: fully solid blue header bar (nav row + location/date/query
  search rig), opaque, no blur. `design-captures/ticketmaster/homepage-*`.
- Eventbrite: fully solid white header bar, opaque, prominent dual search,
  no blur. `design-captures/eventbrite/homepage-*`.
- Verdict: both competitors use solid, opaque headers. Neither uses
  glassmorphism. Solid is the bar.

### Conflict resolution (the flagged item)
The header's actual CSS already had glassmorphism removed (the Batch 11.0
legibility fix set `backdrop-filter: none` in both states). The conflict
was stale: the component docstring still described "dual-state
glassmorphism" with `blur(20px) saturate(180%)`, the globals.css comment
described "navy frosted glass", a non-existent `@supports` fallback was
documented, and the class was named `.site-header-glass`. The evidence
(solid competitor headers) confirms the solid treatment is correct, so the
fix is to purge the false glass naming and docs so code matches CLAUDE.md
and reality - zero visual change.

### Changes shipped
1. Renamed `.site-header-glass` -> `.site-header-bar` (globals.css x2,
   site-header-client.tsx x1). Rewrote both docstrings to describe the
   actual solid-navy dual-state treatment (State A: transparent + top-fade
   navy gradient over hero; State B: solid navy #0A1628 + gold border).
   Removed the dead `backdrop-filter: none` declarations. No pixel change
   to either header state (proven by before/after captures).
2. Footer regression fixed: the documented founder-spec "For organisers"
   column (Sell tickets, Pricing, Organiser guide, Help centre) was a dead
   export rendered nowhere; the desktop grid was `grid-cols-3` despite the
   "4-col" spec. Restored it as the 3rd desktop column (now `grid-cols-4`)
   and a 4th mobile accordion (clean 2x2). Both competitors surface
   organiser entry points; this closes a real content gap.

### Captures
- Before: `surface-1/before/{home-headerA,home-headerB,footer}-{1440,768,390}.png`
- After: `surface-1/after/{home-headerA,home-headerB,footer}-{1440,768,390}.png`
  (after captured on the production server, no dev overlay)
- Header State A/B after are pixel-identical to before; footer after shows
  the restored 4-column desktop and 2x2 mobile layout.

### Benchmark verdict vs Ticketmaster + Eventbrite (1440 + 390)
| Dimension | Verdict | Note |
|---|---|---|
| Typography | Parity | Nav 14px medium, footer heads 12px caps tracked - matches both. |
| Density | Surpass | 4-col footer with community + organiser breadth neither competitor carries; header nav tight and complete. |
| Imagery | Parity | Header is chrome (logo wordmark); no imagery regressions. |
| UX | Surpass | Solid header reads on any hero (gradient State A), search pill on scroll, full keyboard trap + focus-visible on the mobile sheet; organiser footer entry restored. |
| Mobile (390) | Parity | Solid navy header, icon search always present, 2x2 footer accordions, 44px targets. |

### Gates
lint 0 errors (30 pre-existing warnings in research/capture scripts only),
build pass, vitest 275 pass (footer-links 34 pass), axe-core 0 violations
(full page + scoped header/footer, desktop + mobile). Lighthouse runs on the
Vercel preview (CI gate); changes are a CSS class rename + one footer column,
no new JS or imagery, so the surface-0 Lighthouse headroom holds.

---

## Surface 2: /events browse and discovery - DONE

Goal: benchmark the browse surface against the captured competitors and apply
evidence-based refinement. No churn; the page is already mature (the m5 browse
system: hero strip, sticky filter bar, popular rail, grid + map, pagination).

### Evidence (captured competitors, 1440 + 390)
- Ticketmaster (MUSIC browse): solid blue header + category sub-nav, an H1, a
  few filter dropdowns, then a 2-up large-card grid with a gift-card ad rail.
  `design-captures/ticketmaster/browse-discovery-*`.
- Eventbrite (browse): left Filters sidebar (Category, Date, Neighborhood), a
  single-column list of horizontal cards, a right-side map.
  `design-captures/eventbrite/browse-discovery-*`.

### Reality audit
Strong, complete surface. Hero strip (H1 + count + search), sticky filter bar
(date presets, Grid/Map toggle, More-filters sheet with price/date/distance/
sort, category chips), popular rail, a 4-up real-photography grid (24/pg),
pagination, ISR-tuned for LCP. Empty state is fully handled (icon, copy, Clear
filters + Browse all CTAs). Grid cards use the no-blur "light" save button and
opaque badges. All states covered.

### Evidence-based refinement (the change)
The sticky filter bar was glassmorphism: `bg-white/95 backdrop-blur-sm`, the
exact treatment CLAUDE.md forbids and that surface 1 purged from the header.
Both competitors use solid, opaque filter/sub-nav bars. Fixes:
1. Filter bar -> solid `bg-white` (was `bg-white/95 backdrop-blur-sm`). On
   scroll the bar is now fully opaque; grid cards no longer bleed through it.
2. Filter sheet scrim -> solid dim `bg-ink-900/60` (was `bg-ink-900/40
   backdrop-blur-sm`). Modal overlay now dims without a frosted blur.
No layout change; density, cards, and imagery untouched (already above bar).

### Captures
- Before: `surface-2/before/events-{1440,768,390}.png`,
  `events-empty-{1440,768,390}.png` (empty-state proof).
- After: `surface-2/after/events-{1440,768,390}.png` plus
  `events-scrolled-filterbar-1440.png` (solid bar over scrolled grid).

### Benchmark verdict vs Ticketmaster + Eventbrite (1440 + 390)
| Dimension | Verdict | Note |
|---|---|---|
| Density | Surpass | 4-up real-photo grid (24/pg) vs TM 2-up + ad and EB single-column list. |
| Typography | Parity | H1 display, chip labels, card titles at the locked scale. |
| Imagery | Surpass | Every card real photography, image-alone, details below; no ads. |
| UX | Surpass | Date presets + category chips + price/distance/sort sheet + Grid/Map, all keyboard reachable with aria-pressed; solid sticky bar; full empty state. |
| Mobile (390) | Parity | Horizontal-scroll chips, single-column grid, sticky solid bar, 44px targets. |

### Cross-surface follow-up (logged, not churned here)
Remaining `backdrop-blur` glassmorphism lives on other surfaces and is left to
their passes: event-sold-out badge, sticky-action-bar, hero-carousel/featured
hero buttons, save-button "dark" variant, this-week-strip (surfaces 0/3). The
SaveEventButton "dark" frosted variant is unused on browse (cards use "light").

### Gates
lint 0 errors, build pass (509 pages), vitest 275 pass, axe-core 0 violations
(/events desktop + mobile). Lighthouse on the Vercel preview (CI gate); change
is two CSS tokens, no new JS or imagery, so surface-0 headroom holds.

---

## Surface 3: Event detail page - DONE

Goal: benchmark /events/[slug] against the captured competitors and apply
evidence-based refinement. No churn; the page is already the strongest surface
in the app on craft.

### Evidence (captured competitors, 1440 + 390)
- Ticketmaster/Moshtix: small poster thumbnail + a text detail list, a "DON'T
  MIST OUT / Join the waitlist" strip, Afterpay banner. Flat, low-craft.
  `design-captures/ticketmaster/event-detail-*`.
- Eventbrite: poster-art hero, category/owner badge, H1, organiser row with
  follower count + Follow ("TOP ORGANIZER"), right-side sticky ticket panel
  (orange "Get tickets"), location + date, About, FAQ accordion.
  `design-captures/eventbrite/event-detail-*`.

### Reality audit
Far ahead of both competitors on craft (the competitor-page-specs note says so
outright): full-bleed cinematic hero (HeroMedia + navy gradient), category
badge, H1, date/venue, social-proof badge, Get-tickets CTA + all-in price, trust
signals; then About, When/Where cards, venue map, organiser card, tags,
WhatsApp-first share; a sticky ticket panel with inline tiers (or seat selector,
sold-out, or not-on-sale states); related-events grid; cancelled/postponed/past
state banners; private/draft guards. All states handled.

### Evidence-based refinement (the change)
Glassmorphism purge, continuing the surface 1/2 thread and the CLAUDE.md law.
Both competitors use solid elements. Fixes:
1. Hero category badge: was `GlassCard variant="dark"` (backdrop-blur-2xl) ->
   solid navy pill (`bg-ink-900/85` + gold border, no blur). Dropped the now
   unused GlassCard import from the route.
2. StickyActionBar: desktop `bg-white/85 backdrop-blur-md` and mobile
   `bg-white/95 backdrop-blur-md` -> solid `bg-white`. Docstring de-glassed.
3. SaveEventButton "dark" variant: `bg-white/20 backdrop-blur-md` -> solid
   `bg-ink-900/70` (reads on dark imagery; shared with the homepage bento tile,
   so that surface gains the same compliance).
Translucency without backdrop-filter (e.g. card badges at /95) is not
glassmorphism and was left as-is. No layout or content change.

### Deferred (need data or migrations - out of scope for a no-migration sweep)
- Organiser social proof (follower count + Follow) - EB has it, we defer it;
  needs a follows table.
- Know-before-you-go / FAQ accordion - EB has it; needs event FAQ data.
- "Tickets not yet on sale" conversion dead-end (seen on the captured event) -
  filter these from discovery or convert to notify-me; a discovery/data change,
  not a detail-page UI fix. Logged in [[project_system_pass_sweep]].

### Captures
- Before: `surface-3/before/detail-{1440,768,390}.png`
- After: `surface-3/after/detail-{1440,768,390}.png` +
  `detail-scrolled-stickybar-1440.png`

### Benchmark verdict vs Ticketmaster + Eventbrite (1440 + 390)
| Dimension | Verdict | Note |
|---|---|---|
| Density | Surpass | Full detail set (hero, about, when/where, map, organiser, share, tiers, related) vs TM's thumbnail list. |
| Typography | Surpass | Display H1 clamp(2-4rem), sectioned eyebrows; competitors run flat system type. |
| Imagery | Surpass | Cinematic full-bleed hero vs EB poster card and TM thumbnail. |
| UX | Surpass | Inline multi-tier panel, all-in pricing promise, sticky summary, venue map, WhatsApp share, every sale/lifecycle state handled. |
| Mobile (390) | Surpass | Hero + stacked content + solid bottom action bar; 44px targets. |

### Gates
lint 0 errors, build pass, vitest 275 pass, axe-core 0 violations (event detail
desktop + mobile). Lighthouse on the Vercel preview (CI gate); change is CSS-only
(removed backdrop-filter), no new JS or imagery.

---

## Surface 4: Search results (/events?q=) - DONE

Goal: the search-results experience. Same route as /events browse (surface 2),
so the surface-specific question is query framing: does the page acknowledge
what the user searched for?

### Evidence
Search results on both competitors are their browse/discovery layout with a
query applied and an explicit "search results for X" framing
(`design-captures/*/browse-discovery-*`). Ours reused the browse shell verbatim:
the hero kept the generic "Find your next event" heading and a bare "N events
available" count regardless of `q` - the only query signal was the pre-filled
search box.

### Evidence-based refinement (the change)
1. Query-aware hero: when `?q=` is present the H1 becomes `Results for "<q>"`
   (trimmed, capped at 80 chars, React-escaped) instead of the generic browse
   heading. Empty/whitespace `q` falls back to "Find your next event".
2. Query-aware empty state: a no-result search now reads `No results for "<q>"`
   (was the generic "No events match these filters"), keeping the
   widen/clear/browse guidance and dual CTAs. The query threads through the
   grid (which already had `params`) into EventsEmptyState.
No change to the grid, cards, filter bar, or density - those are the surface-2
browse system, already above bar and now query-framed on top.

### Captures
- Before: `surface-4/before/search-{1440,768,390}.png` (q=afrobeats, generic heading)
- After: `surface-4/after/search-{1440,768,390}.png` (q=afrobeats -> "Results for
  ...") and `search-empty-{1440,768,390}.png` (q=quokkazzz -> "No results for ...")

### Benchmark verdict vs Ticketmaster + Eventbrite (1440 + 390)
| Dimension | Verdict | Note |
|---|---|---|
| Density | Surpass | Inherits the 4-up browse grid; results render at the same density as browse. |
| Typography | Parity | "Results for ..." H1 at the display scale; competitors frame search similarly. |
| Imagery | Surpass | Real-photo result cards vs competitor list rows. |
| UX | Surpass | Query echoed in H1 + box + empty state; full filter set still applies to a search; clear/browse recovery from zero results. |
| Mobile (390) | Parity | Same query framing; single-column results; sticky solid filter bar. |

### Gates
lint 0 errors, build pass, vitest 275 pass, axe-core 0 violations (search
populated + empty, desktop + mobile). Lighthouse on the Vercel preview (CI gate);
change is a conditional heading string + one prop, no new JS or imagery.

---

## Surface 5: City page (/city/[slug]) - DONE

Goal: benchmark the city landing and apply evidence-based refinement. No churn.

### Evidence (captured competitors, 1440 + 390)
- Eventbrite city page: a filtered event list ("Events and Things to do in
  Sydney") with a Filters sidebar and a side map. A search view, not a place
  landing. `design-captures/eventbrite/city-page-*`.
- Ticketmaster: a city venue/event list. `design-captures/ticketmaster/city-page-*`.

### Reality audit
A true editorial city landing, far richer than either competitor: cinematic
hero with caption, an editorial intro, this-weekend rail, browse-by-event-type
tiles, a live "where the city is happening" map, highlights rail, popular-by-
organiser, by-suburb tiles, by-community tiles, an organiser CTA panel, and a
newsletter capture. CityLandingPage template; all rails handle their data.

### Evidence-based refinement (the change)
Glassmorphism purge, continuing the sweep thread (CLAUDE.md):
1. Sticky date-filter chip bar: `bg-[var(--surface-0)]/95 backdrop-blur` ->
   solid `bg-[var(--surface-0)]` (same fix as the surface-2 /events filter bar).
2. Hero secondary CTA: dropped `backdrop-blur` (kept the bordered ghost button
   `border-white/70 bg-white/10`; translucency without backdrop-filter is fine).
No structural/content change; the editorial rails were already above bar.

### Captures
- Before: `surface-5/before/city-{1440,768,390}.png`
- After: `surface-5/after/city-{1440,768,390}.png`

### Benchmark verdict vs Ticketmaster + Eventbrite (1440 + 390)
| Dimension | Verdict | Note |
|---|---|---|
| Density | Surpass | A full place-landing (hero, intro, multiple rails, map, suburbs, cultures) vs a single filtered list. |
| Typography | Surpass | Editorial display headings + sectioned rails vs flat list type. |
| Imagery | Surpass | Real city/suburb/culture/event photography throughout. |
| UX | Surpass | Date-chip quick filter, live map, suburb + culture discovery, organiser CTA; solid sticky date bar. |
| Mobile (390) | Surpass | Stacked rails, horizontal-scroll chips, full-width CTAs at 44px. |

### Gates
lint 0 errors, build pass, vitest 275 pass, axe-core 0 violations (city desktop
+ mobile). Lighthouse on the Vercel preview (CI gate); change removes two
backdrop-filters, no new JS or imagery.

---

## Surface 6: Organiser landing (/organisers) - DONE (verified at bar, no code change)

Goal: benchmark the organiser-marketing landing and refine on evidence.

### Evidence (captured competitors, 1440 + 390)
- Eventbrite (`/organizer/overview`): "WHERE EVENT ORGANIZERS GROW" split hero
  (headline left, lifestyle photo right), Get-started/Contact-sales CTAs.
  `design-captures/eventbrite/for-organisers-*`.
- Ticketmaster Business AU: B2B marketing site.
  `design-captures/ticketmaster/for-organisers-*`.
- competitor-page-specs.md section 5 deltas for `/organisers`: (a) lead with
  transparent all-in fees as a headline differentiator; (b) add concrete proof
  (payout timing, dashboard screenshots, real organiser outcomes); (c) one
  unmissable "Start selling" CTA with a fast self-serve path.

### Reality audit + benchmark
OrganisersLandingPage already surpasses both on completeness: hero ("Sell
tickets. Keep more." + a transparent-fees/real-time-tools/checkout subtitle +
primary "Start selling tickets" CTA), three value pillars (lead pillar is
"All-in pricing"), a 4-step "how it works", an "open to every community"
breadth section, an Organiser FAQ accordion (real help-centre content), and a
dark "Ready to sell tickets?" CTA. No glassmorphism on this surface.

Delta (a) is already substantially met (fees lead the H1 intent, the subtitle,
and the first pillar). Delta (c) is met (single gold primary CTA, repeated in
the closing band, self-serve at /organisers/signup).

### Decision: no code change (avoid churn + fabrication)
The only unmet delta is (b) concrete proof - dashboard screenshots, real payout
timing figures, named organiser outcomes. That needs real assets and a locked
platform-fee number (the fee % is still open per the fee-model decision), and
fabricating proof would violate Law 1 (no generic) and Law 3 (verified data).
EB's hero photo is the one stylistic lead, but a hero-image redesign needs a
curated asset + founder design sign-off and was not in the specs' /organisers
deltas, so it is not forced in an autonomous sweep. The page is strong,
compliant, and above the bar as-is.

### Deferred (need assets / data / founder sign-off)
- Concrete proof block: payout-timing figure, a real dashboard shot, named
  organiser outcomes (delta b).
- Optional lifestyle hero photograph to match EB's visual richness.
- Headline all-in fee % once the platform-fee decision locks (see
  [[project_fee_model]]).

### Captures
- `surface-6/before/organisers-{1440,768,390}.png` (current state == delivered
  state; no after diff because no code changed).

### Benchmark verdict vs Ticketmaster + Eventbrite (1440 + 390)
| Dimension | Verdict | Note |
|---|---|---|
| Density | Surpass | Pillars + steps + community + FAQ + CTA vs EB's single hero-led page. |
| Typography | Parity | Display H1/headings at the locked scale. |
| Imagery | Parity-minus | Text-forward hero; EB leads with a lifestyle photo (deferred asset). |
| UX | Surpass | Clear self-serve path, FAQ reduces friction, one unmissable CTA. |
| Mobile (390) | Parity | Stacked sections, 44px CTAs, accordion FAQ. |

### Gates
axe-core 0 violations (desktop + mobile). Copy clean: no em/en-dashes, no
exclamations (the only `!` is a Tailwind important modifier), Australian
English, community-first. lint/build/vitest unchanged (no code touched).

---

## Surface 7: Checkout surfaces - DONE (verified at/above bar via code review)

Goal: benchmark the checkout flow and refine on evidence. The live
/checkout/[reservation_id] page needs an active held reservation on a
Stripe-connected organiser, which the local seed does not provide and the laws
defer to the launch live-purchase pass (see [[project_refund_verification_checklist]]),
so this surface is benchmarked by code review + the captured EB checkout.

### Evidence (captured competitor)
- Eventbrite checkout (`design-captures/eventbrite/checkout-*`): a centred modal
  over a dimmed page - Promo Code field, ticket-type cards with a single bundled
  fee inline ("A$155.20 incl A$5.20 Fee"), "Sales end on ...", inclusions, a
  stepper, a "Going fast" urgency pill, and a "Check out" CTA.

### Reality audit + benchmark
The checkout page (`/checkout/[reservation_id]`) is robust and compliant:
- Guest + authenticated checkout, reservation ownership + expiry enforcement,
  seat and GA paths, fee calculation via PaymentCalculator.
- A clean handled error state when fee calc fails (reservation preserved, "Try
  again" + email support), not a crash to the error boundary.
- CheckoutSummary shows the full ITEMISED all-in breakdown: Subtotal, Discount,
  Service fee, Payment processing fee, Tax (GST), then a bold Total, plus a
  "Secure checkout, payment encrypted end-to-end" trust signal and a
  CheckoutTrustSignals sidebar.
- No glassmorphism anywhere in checkout; no em/en-dashes in copy.

Key differentiator: we show the itemised all-in total before payment; Eventbrite
bundles a single fee onto the ticket card and reveals it late. Our fee
transparency surpasses EB (the strategy weapon in competitor-page-specs).

### Decision: no code change
Checkout is glassmorphism-free, copy-compliant, fee-transparent beyond EB, and
fully state-handled. No evidence-based refinement is warranted; forcing change
would be churn.

### Deferred to launch live-purchase pass (environmental, not skipped)
- Playwright before/after of the live checkout page + ticket-selection modal,
  and a live Stripe round-trip, all require a sellable (Stripe-connected) event
  and a held reservation. Tracked in the refund/launch verification checklist.

### Benchmark verdict vs Eventbrite (code review)
| Dimension | Verdict | Note |
|---|---|---|
| Density | Parity | Focused single-purpose checkout; trust sidebar adds context. |
| Typography | Parity | Summary at the locked scale, tabular-nums on figures. |
| Imagery | N/A | Checkout is intentionally chrome-light. |
| UX | Surpass | Itemised all-in fees up front, guest checkout, robust error/expiry recovery, encryption trust signal. |
| Mobile (390) | Parity | Form stacks above the trust panel; summary remains legible. |

### Gates
No code touched (lint/build/vitest unchanged). Static review: 0 glassmorphism,
0 banned punctuation, full fee transparency. Live axe/Lighthouse on the checkout
page run in the launch live-purchase pass.

---

## Surface 8: Order confirmation + ticket view - DONE

Goal: benchmark the post-purchase confirmation and the digital ticket, refine on
evidence. Both render only for a real completed order, so the live Playwright
capture is deferred to the launch live-purchase pass (per
[[project_refund_verification_checklist]]); benchmarked here by code review.

### Reality audit
- Order confirmation (`/orders/[order_id]/confirmation`): success header
  ("You're in" / "Order received"), order number, event card, "Tickets
  Purchased" with total paid, an issued-tickets section rendering each ticket's
  server-generated SVG QR inline ("Show this QR at entry. One QR admits one
  person.") with a View-ticket link, a genuine pending state while the Stripe
  webhook runs, a guest "create an account" CTA, and add-to-calendar actions.
  Guest + auth + organiser-aware logo link. All states handled.
- Ticket view (`/t/[code]`): mobile-first (max-w-md) ticket card, large server
  SVG QR, token-compliant (`bg-canvas`, `text-ink-900`), a clean error state for
  an invalid code. No glassmorphism, no hardcoded colours.

### Evidence-based refinement (the change)
Design-system compliance (CLAUDE.md "No new colours; navy #0A1628"). The order
confirmation hardcoded an OFF-BRAND navy `#1A1A2E` (and `#2d2d4a` hover) on the
wordmark and the "Create Account" button, while the same page's "View ticket"
button already used the correct `bg-ink-900` (and `--color-ink-900` is exactly
#0A1628, the brand navy). Mapped both off-brand instances to the brand token:
- wordmark `text-[#1A1A2E]` -> `text-ink-900`
- Create-account button `bg-[#1A1A2E] hover:bg-[#2d2d4a]` -> `bg-ink-900 hover:bg-ink-800`
The ticket view needed no change (already token-compliant).

### Cross-surface follow-up (logged, not churned here)
`#1A1A2E` / `#2d2d4a` is a systemic off-brand navy (31 uses) beyond this
surface: checkout-form (incl the Stripe Elements `colorPrimary`), queue-room,
squad-pay, dashboard discounts, refund-dialog, global-error. A focused
token-compliance sweep should map them to `ink-900` / `navy-950`; the Stripe
`colorPrimary` needs care (verify the Elements theme against the brand navy).
Logged in [[project_system_pass_sweep]].

### Captures
- Live confirmation + ticket captures deferred to the launch live-purchase pass
  (need a completed order + valid ticket code). Code-review benchmark stands.

### Benchmark verdict (code review)
| Dimension | Verdict | Note |
|---|---|---|
| Density | Surpass | Confirmation packs event + tickets + inline QR + calendar + guest CTA; ticket is a focused single-purpose card. |
| Typography | Parity | Display headings + mono for codes/order numbers. |
| Imagery | N/A | QR is server SVG (media-rules compliant, no raw img). |
| UX | Surpass | Inline scannable QR on confirmation (no extra hop), pending-state honesty, add-to-calendar, guest account capture, one-QR-one-person clarity. |
| Mobile (390) | Surpass | Ticket view is mobile-first max-w-md, QR sized for door scanning. |

### Gates
build pass, lint 0 errors, vitest 275 pass. Live axe/Lighthouse run in the
launch live-purchase pass. Copy clean (no em/en-dashes).

---

## QUALITY DIRECTIVE - mid-mission escalation (received during Surface 9)

A higher bar landed mid-run and applies to every surface, including completed
ones. Summary and status below; this RAISES the standard above the surface
sections above (which were done to the prior bar and now need a fresh-capture +
proof-table + Phase-B pass to fully satisfy it).

### Directive requirements
1. FRESH live Ticketmaster AND Eventbrite captures per surface at 1440 + 390
   (not the cached `design-captures/`), pick the stronger pattern, justify it.
2. Phase A: match or surpass that evidence on layout, density, hierarchy,
   imagery, typography, interaction, mobile. Equal is the floor.
3. Phase B: then layer EventLinqs polish - navy/gold identity, restrained
   premium motion (staggered reveals, hover, eased glide), designed skeleton
   loading (no layout shift, no spinners-on-white), expensive micro-interactions.
4. HARD BANS: no legacy components, no old section treatments, and NO DARK
   BACKGROUNDS - every page is the light, airy navy-on-canvas homepage system.
   Boundary (founder-clarified): darkness from a PHOTOGRAPH + navy overlay
   (the homepage hero pattern) stays; darkness from a FLAT PAINTED surface gets
   rebuilt to light. Checkout + confirmation move to light canvas.
5. PROOF per surface: a comparison table vs the chosen competitor with
   SURPASS / PARITY / BELOW per aspect incl loading; BELOW = iterate.
6. AUDIT every completed surface against this before proceeding.

### Done this session under the directive
- Verified live competitor capture is feasible here (EB + TM both load 200 via
  Playwright) - the fresh-capture requirement is achievable.
- AUDITED all completed buyer surfaces for dark backgrounds + legacy.
- DARK-BACKGROUND SWEEP shipped (commit 919b51f): rebuilt every flat-dark,
  obsidian-era section to light navy-on-canvas - Organiser CTA band, Category
  CTA band + CategoryHeroEmpty default mode, Pricing CTA band, City
  organiser-CTA panel + its newsletter (tone prop), order-confirmation page +
  ticket cards, checkout page backgrounds. Photographic heroes KEPT (event
  detail, city, category) per the boundary. Verified light by fresh capture
  (city, categories, organisers at 1440/768/390). Gates green.
- Logremaining dark items below.

### REMAINING to fully satisfy the directive (continue next session, in order)
Per surface (0-9), still owed at the new bar:
- FRESH live TM + EB captures at 1440 + 390 saved under each surface folder,
  stronger-pattern choice stated.
- PROOF table with SURPASS/PARITY/BELOW per aspect incl LOADING; iterate any BELOW.
- PHASE B polish: audit/raise motion (staggered reveals, hover lift, eased
  rail glide per the Motion law), replace any spinner/blank loading with
  DESIGNED skeletons (no layout shift), add premium micro-interactions.
- Finish Surface 9's full new-bar benchmark (dark sweep already applied to it).

Remaining DARK treatments on ADJACENT surfaces (outside the core 9, sweep next):
- `culture-organiser-cta.tsx` (flat bg-surface-dark) on /culture/* pages, where
  most /categories/* slugs 308-redirect.
- `SuburbLandingPage` uses `ContentSection surface="dark"`.
- `organiser-contact-panel.tsx` (/organisers/[handle]) still renders the
  newsletter on dark (kept via the tone default; rebuild that surface light).
- `Prose` dark code blocks (`[&_pre]:bg-surface-dark`) in rich-text descriptions.

LEGACY dead components to delete (unused, do not render but must not survive):
`filter-sidebar.tsx`, `this-week-strip.tsx`, `free-weekend-tile.tsx`.

Deferred captures (need live order/reservation - launch live-purchase pass):
checkout page, order confirmation, ticket view live Playwright + axe/Lighthouse.

### Note on the surface sections above
Surfaces 1-8 above were assessed against the cached competitor captures and the
prior bar, then brought into dark-background + glassmorphism + token compliance.
They are NOT yet re-proven with FRESH live captures + the full SURPASS/PARITY/
BELOW table + Phase-B polish. That re-audit is the first task of the next pass.

---

## Session: directive cleanup + first Phase-B loading pass (2026-06-06)

Paid down the report's concrete REMAINING cleanup items (fully gate-verified)
and made the first Phase-B buyer-journey loading contribution. Per-unit commits
on feat/home-rebuild; gates green at each step (tsc 0, eslint 0, vitest 275,
next build exit 0).

### Shipped
1. Off-brand #1A1A2E navy sweep - APP SURFACES (commit 3ef2da0). Mapped the
   ~31 off-brand-navy uses to the brand palette: `bg-[#1A1A2E]` -> `bg-ink-900`
   (#0A1628), `hover:bg-[#2d2d4a]` -> `hover:bg-ink-800` (the surface-8
   precedent), `text-[#1A1A2E]` -> `text-ink-900`, inline hex -> `#0A1628`,
   and the Stripe Elements `colorPrimary` -> `#0A1628`. Files: checkout-form,
   refund-dialog, start-squad-modal, squad-join-panel, squad-pay-form,
   queue-room, global-error, discounts-client, join-waitlist-modal. Verified no
   `#1A1A2E`/`#2d2d4a` remains in any .tsx/.ts app component.
2. Dead legacy components deleted (commit 3aa5985): filter-sidebar.tsx,
   this-week-strip.tsx, free-weekend-tile.tsx - exported but imported nowhere
   (verified kebab-path + PascalCase grep across src). 477 lines removed.
3. Adjacent dark panels rebuilt light (commit 478fdb7), per the
   no-dark-backgrounds directive: organiser-contact-panel (flat navy-950 ->
   light surface-1 matching city-organiser-cta-panel, newsletter tone=light);
   culture-organiser-cta (now adaptive - light on canvas by default, dark only
   with a photographic backdrop, the allowed photo+overlay pattern);
   SuburbLandingPage city-directory closer (ContentSection dark -> alt, text ->
   ink/gold-strong); Prose block code (surface-dark panel -> light surface-2 +
   ink-200 border, matching inline code).
4. Phase-B buyer-journey loading skeletons (commit 20f75ef): added the missing
   route-level loading.tsx for events/[slug] and checkout/[reservation_id] - the
   two purchase-flow steps that had none, so browse -> detail -> checkout shows a
   designed settle, not a blank flash. No spinners; brand-palette shimmer on the
   light canvas, gold-tinted CTA placeholder, dark photo-hero mirror on detail.
   Captured + visually confirmed at 1440 + 390 (premium, not generic):
   `docs/benchmark/system-pass/phase-b/loading/{event-detail,checkout}-loading-{1440,390}.png`
   (local; system-pass PNGs are gitignored by project convention and referenced
   here, not committed).

### REMAINING after this session (in priority order)

PHASE B (founder's named priority - the "reads generic" fix):
- MOTION audit + raise per surface, per the Motion law: staggered fade-and-rise
  reveals on load, gentle scroll reveals, subtle card hover lift, eased rail
  glide, 150-300ms ease-out, prefers-reduced-motion respected. (Event detail
  already has `animate-fade-rise` on the hero and hover-lift on the CTA; homepage
  rails glide. Most interior/buyer surfaces are unaudited for motion.)
- More designed loading: confirmation already has an in-page pending state (ok);
  consider loading.tsx for city/[slug], search, organiser profile if their
  navigations flash. Replace remaining spinners (`animate-spin`) with designed
  states: queue-room, squad-pay-form, surprise-me-modal, connect-onboarding-card.
- BUYER JOURNEY FLOW PASS proper: capture TM + EB full purchase flows step by
  step, benchmark ours as ONE flow, elevate calendar/date picker, ticket
  quantity selectors, price summary, form fields, button states, step
  transitions, expired-reservation state. Live PAID order capture stays deferred
  to staging certification.

PER-SURFACE NEW-BAR RE-AUDIT (surfaces 0-9): still owed FRESH live TM + EB
captures at 1440 + 390 per surface folder, stronger-pattern choice stated, and a
PROOF table with SURPASS/PARITY/BELOW per aspect incl LOADING; iterate any BELOW.

DARK SURFACES newly discovered this session (beyond the report's adjacent list -
triage + sweep next; some may be intentional photo/media and exempt):
- Marketing pages on `ContentSection surface="dark"`: about, blog, careers,
  press (and dev preview routes /dev/logo-preview, /dev/shell-preview - dev only).
- `cultural-calendar-widget.tsx` (surface-dark).
- `queue/[slug]/queue-room.tsx` - full-screen FLAT dark (bg-ink-900 after the
  token fix). A deliberate waiting-room pattern; rebuilding it light is a design
  decision worth founder input. Its wordmark also uses an off-brand blue
  `text-[#4A90D9]`.
- `home/section-skeletons.tsx` LiveVibeSkeleton uses `bg-ink-950` (matches the
  homepage live-vibe media rail; likely intentional, confirm).

OTHER OFF-BRAND COLOURS found during the navy sweep (separate from #1A1A2E,
not yet swept): `#4A90D9` (blue - queue-room, squads), `#6B7280` (grey -
refund-dialog, global-error), `#F0F6FF` (squad summary tint). Map to brand
neutrals/accents in a follow-up.

EMAIL off-brand navy (separate surface family, literal hex required, NOT in the
~31 app-surface count): auth templates (confirm-signup, password-reset,
magic-link, reauthentication, email-change), the Stripe webhook ticket email,
and waitlist promote.ts still use `#1A1A2E`. Map to `#0A1628` in an email pass.
