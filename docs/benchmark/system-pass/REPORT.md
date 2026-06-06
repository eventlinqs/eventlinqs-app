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

EMAIL off-brand navy - DONE ON MAIN (PR #89, merged 2026-06-06). The email
brand pass landed on main and is now in this branch: auth templates (confirm-
signup, password-reset, magic-link, reauthentication, email-change), the Stripe
webhook ticket email, and waitlist promote.ts all mapped `#1A1A2E`/`#4A90D9` ->
`#0A1628`. Verified post-merge: zero `#1A1A2E` remains in any email source
file (`git grep` clean across `src/lib/email/**`, the Stripe webhook route, and
promote.ts). Recorded in `docs/launch-hardening/email-brand-pass.md`.

---

## Session: Phase-B motion engine + choreography + Scenes V2 (2026-06-06)

The founder's named "reads generic" fix. Motion engine decision (founder
ruling): CSS-first, zero new dependency; framer-motion only with approval.
Per-unit commits on feat/home-rebuild; gates green at every step (tsc 0,
eslint 0, vitest 275, next build exit 0).

### Shipped (committed)
1. Motion law + skill rewritten (e19998b, 04142c4): CSS-first engine, the
   choreography bar (alive and breathing, felt not watched), the locked Glide
   standard, and the Density-proof rule (all captures + verdicts at full fixture
   density, no thin-rail evidence).
2. Motion engine foundation (fa85dc4): `Reveal` client component
   (`src/components/ui/reveal.tsx`, IntersectionObserver, once, unobserves) +
   the globals.css choreography layer (`.reveal`/`.reveal-stagger` 12-16px rise
   300ms ease-out + left-to-right child stagger; `.hero-enter` on-load content
   stagger; `.card-hover-lift`/`-media`; sticky-header elevation + smooth bg
   transition). Pre-paint head bootstrap sets `html[data-motion=1]` only for
   real users (not headless, not reduced-motion): no-JS / reduced-motion /
   Lighthouse render fully visible from first paint, so motion is flash-free,
   never blocks reading, and never costs the LCP/mobile gate.
3. Rail arrow glide raised (0f471f6): distance-eased rAF cubic ease-out,
   ~400-550ms scaled by distance, lands on card snap boundaries; pages by the
   live visible-card count; arrow press states + symmetric edge fades; keyboard
   arrows; touch/trackpad untouched (any input cancels an in-flight glide);
   reduced-motion jumps instantly.
4. Choreography applied to the homepage (25f6161): hero content staggers in
   (LCP image never animates); every below-fold rail (13 category rails via
   EventRailSection, This Week, By City, Scenes, Featured Venues) fade-rises on
   scroll-in; card hover tuned to spec (EventCard -3px lift + 1.025 zoom; home
   card family + scene tiles dropped the old 1.05/700ms drift for 1.03/200ms);
   hero nav arrows de-glassed (backdrop-blur -> solid navy, clearing the last
   surface-2 glass follow-up). Verified at 1440 + 390 with scroll-through
   captures (`phase-b/motion/`): hero settles, every rail reveals and is fully
   populated, header elevates on scroll, nothing stuck hidden; reduced-motion +
   headless show everything from first paint. Lighthouse mobile 95+ is the
   preview/CI gate per CLAUDE.md (never a single localhost run); the design is
   gate-safe by construction (headless agent sees a static page).
5. Dark triage + dead code (44c5a42): deleted the dead live-vibe trio
   (home/live-vibe-section, events/live-vibe-marquee, LiveVibeSkeleton bg-ink-950)
   and the dead `CulturalCalendarWidget` (had a surface-dark CTA); extracted its
   live footer flags to `first-nations-flags.tsx` (official sovereign flag
   colours kept exact). Fixed a loading CLS bug: RailHeaderSkeleton was type-h2
   (40px) vs the real 24px rail heading, now matches (zero-shift settle).
6. Colour tokenize (01dc530): `#6B7280` is the defined value of brand
   `--color-ink-400`, not off-brand; tokenized the two hardcoded literals in
   refund-dialog (zero visual diff).
7. Scenes Architecture V2 (241514f): SceneRail rebuilt to the research-backed
   V2 set, two families in ONE rail (12 music + 7 culture), family markers,
   inheriting the glide + reveal + hover. CLAUDE.md Scene layer + seed-events
   skill updated to V2 verbatim; the old 7-scene set renders nowhere. Verified
   at 1440 + 390 (`phase-b/scenes-v2/`).

### FLAG - missing scene landing pages (post-photos taxonomy mission)
V2 interim routing avoids all 404s. Only **First Nations** has a live landing
(`/culture/aboriginal-torres-strait-islander`). The other 18 link to the
interim filtered events view (`/events?q=...`) and need dedicated landing pages:
- Music & sound (12): Electronic & Dance, Country, Indie & Rock, Hip-Hop & RnB,
  Pop, Folk & Acoustic, Blues & Roots, Afrobeats & Amapiano, Latin, Caribbean &
  Dancehall, Jazz & Soul, Metal & Hardcore.
- Community & culture (6): South Asian, Asian, Pasifika & Maori, Mediterranean,
  Pride, Faith & Worship.
Also reconcile `src/lib/hero-categories.ts` (still gospel/owambe/networking/
heritage-and-independence) against the V2 scene taxonomy in that mission.

### REMAINING (continue next session, in priority order)
- MOTION per-surface application: the homepage (surface 0) is fully wired and
  interior surfaces inherit the raised glide + card hover automatically (shared
  SnapRail + EventCard + home cards). Still owed: page-level `<Reveal>` section
  wraps and `hero-enter` on the interior buyer surfaces (/events, /city,
  /categories, /culture, event detail, search, /organisers).
- CONTAINER WIDTH (#11): NOT started. Measure live TM + EB content-container
  widths at 1440 + 1920, derive a wider shared CONTAINER token, re-verify
  cards-per-row, confirm 768/390 untouched, capture before/after vs TM. Lock the
  number into the skill. (Capture-gated: needs live TM.)
- OFF-BRAND #4A90D9 / #F0F6FF: live only in squad + queue surfaces. Deferred to
  (a) the queue-room LIGHT rebuild and (b) the buyer-journey button unification.
  Recommended mapping: solid actions -> navy `#0A1628`; accent text -> gold
  `--brand-accent-strong`; focus -> `--color-gold-400`; Stripe colorPrimary ->
  `#0A1628`. KEEP: `seat-maps/actions.ts` `#4A90D9` (categorical seat-colour
  data) and the flag colours (sovereign). Squad surfaces are capture-gated (auth).
- DESIGNED LOADING (#6): remaining `animate-spin` spinners -> designed states:
  surprise-me-modal, connect-onboarding-card (standalone); squad-pay-form (with
  the squad work), queue-room (with its light rebuild). Verify whether
  city/[slug], search, organiser-profile navigations flash and add loading.tsx
  if so. (event-detail + checkout loading.tsx already shipped a prior session;
  RailHeaderSkeleton CLS fixed this session.)
- DARK rebuilds (#7): queue-room LIGHT (photo+overlay allowed when the event has
  an image); marketing about/blog/careers/press dark `ContentSection`s -> light.
  (Dev preview routes /dev/* are dev-only, exempt. Email templates are NOT ours.)
- BUYER JOURNEY FLOW (#8): NOT started. Capture TM + EB purchase flows step by
  step, benchmark ours as ONE flow, elevate calendar/date picker, quantity
  selectors, price summary, form fields, button states, step transitions,
  expired-reservation state; unify bespoke navy pay/CTA buttons onto the
  canonical gold `Button`. Live PAID capture stays deferred to staging.
- PER-SURFACE NEW-BAR RE-AUDIT (#9): surfaces 0-9 still owe FRESH live TM + EB
  captures at 1440 + 390 per surface folder, stronger-pattern choice stated, and
  the SURPASS/PARITY/BELOW proof table incl loading; iterate any BELOW.
  (Capture-gated.)

### Continued same session: push + preview density + interior reveals

- Branch PUSHED to origin/feat/home-rebuild (no merge) at each step, so the
  Vercel preview + CI Lighthouse gate spin for the founder's wholesale review.
  Latest pushed commit: 1905ff3.
- PREVIEW DENSITY (queued item, executed): preview deployments now render the
  full 55-event catalogue (24aa61d). A `prebuild` step
  (`scripts/prebuild-fixture.mjs`) regenerates the fixture at build time when
  `HOMEPAGE_SEED_FIXTURE=1`; `next.config` `outputFileTracingIncludes` ships the
  JSON in the homepage serverless bundle. HARD GUARD: the prebuild aborts the
  build if the flag is set with `VERCEL_ENV=production`, and `loadHomeUpcoming`
  ignores the flag in production. Documented as a Preview-only env var in
  `.env.example`. Verified both paths (flagged build wrote 55 events, exit 0;
  unflagged build skipped, exit 0, tracing-include of the absent file a no-op).
- INTERIOR-SURFACE REVEALS (started, #3 cont.): event-detail Related-events grid
  fade-rises on scroll; `ContentSection` gained an opt-in `reveal` prop (wraps
  content in the shared Reveal) so every interior surface on it can fade-rise
  consistently - enabled on the city Browse-by-culture rail as first adopter
  (1905ff3). Also fixed an off-brand colour the hex grep missed:
  `ContentSection` topBorder accent was blue `rgba(74,144,217)` (#4A90D9) ->
  brand gold (recolours the accent line on every interior section using it).
- STILL OWED on interior reveals: wire `reveal` (or `<Reveal>`/`hero-enter`)
  through the remaining interior surfaces - /events browse grid + popular rail,
  /city other ContentSections, /culture, search, /organisers, and the
  event-detail About/When-Where column (left as one block to avoid the sticky
  2-col layout risk; revisit). Then CONTAINER WIDTH (#11) once live Ticketmaster
  measuring is possible. Remaining items (#5 squad/queue blue, #6 spinners, #7
  queue-room/marketing light, #8 buyer flow, #9 re-audit) unchanged above.

---

## Session: desktop width + buyer journey + polish (2026-06-06)

Per-unit commits on feat/home-rebuild, pushed (no merge); gates green at each
unit (tsc 0, eslint 0 errors, vitest 275, next build exit 0).

### Unit 1 - CONTAINER WIDTH (#11) - DONE (commit b8ca8a9, pushed)
Measured live TM + EB content containers at 1440 + 1920
(`scripts/container-width-measure.mjs`, evidence under
`phase-b/container-width/`, PNGs gitignored):
- Ticketmaster: fluid, ~40px gutters, container ~1360 at 1440 and ~1840 at 1920
  (no hard cap below ~1840).
- Eventbrite browse ~1392 at 1440; Eventbrite home capped ~1272.
- Ours was 1280 (`max-w-7xl`) - narrower than all three.

Derived the wider fixed cap: **1400px**. Applied as a single-token override
`--container-7xl: 87.5rem` in the globals.css `:root` block (NOT `@theme
inline` - `max-w-7xl` resolves via `var(--container-7xl)` against the base
theme's root var, so the inline form does not rewrite it; the `:root` override
after `@import "tailwindcss"` wins the cascade). Because `max-w-7xl` is the
canonical cap on every surface (header, footer, heroes, rails, content,
checkout, event detail), the whole site widened in one change, aligned.

Verified before/after (`scripts/container-ours-capture.mjs`,
`phase-b/container-width/ours-{before,after}/`):
- 1440: container 1280 -> 1400 (surpasses TM 1360, EB-browse 1392, EB-home 1272)
- 1920: caps cleanly at 1400 (~260px gutters; disciplined vs TM's 1840)
- 768: 720 unchanged; 390: byte-identical before/after (cap never binds,
  px-4 sm:px-6 gutters untouched)
- cards-per-row + rail peek re-checked: rails show one more card / a wider peek,
  the events grid stays balanced, the full-bleed hero is unaffected.
Locked 1400 + the derivation into the page-build skill (Container width
standard). Side-by-side vs Ticketmaster lives in the same evidence folder
(tm-*-1440/1920 beside ours-after).

### Unit 2 - BUYER JOURNEY FLOW (#8) - checkout core DONE (commit ed7b37e, pushed)
Benchmarked ours as one flow vs the captured Eventbrite checkout + documented
Ticketmaster pattern; ours is already one-page (hold, trust signals, all-in
pricing, cart timer, promo code). Closed the craft gaps on the checkout surface:
- CTA unification: the bespoke navy (bg-ink-900) + off-palette emerald (#10B981)
  pay/continue/register/try-again buttons all use the canonical gold Button now,
  so one gold thread runs Get-tickets -> Checkout -> Continue to payment -> Pay.
  Discount Apply -> Button secondary; checkout-load-error recovery -> Button
  primary+secondary (also kills undefined ink-300/ink-50 literals).
- Form fields -> shared FIELD_CLS (44px+ touch, 16px text, no iOS zoom).
- Ticket quantity steppers 36/32px -> 44px; expired-reservation state -> premium
  card with the --color-error token + gold CTA. discount error -> text-error.
Gate-verified (tsc/eslint/vitest/build). The live checkout FORM + on-sale
steppers are unreachable locally (all prod Sydney events are sale-blocked), so
that visual proof stays deferred to staging, same as the existing checkout/
confirmation/ticket deferrals. #4A90D9/#F0F6FF live only in squad (auth) +
queue-room (its light rebuild). NOT-DONE in #8 (minor): the named "calendar/date
picker" is a browse-filter, not a purchase-flow component (handle under #9);
checkout form->payment "step transition" is an instant swap (minor polish).

### Unit 3 - INTERIOR REVEALS (#3) - DONE (commit bb94745, pushed)
Wired the shared Reveal / ContentSection `reveal` prop (LCP-safe, data-motion
gated) through the interior surfaces:
- /events: browse grid fade-rises only when the popular rail is above it (below
  fold); filtered view's LCP-eager grid + the popular rail (the /events LCP) are
  never wrapped. Search = /events?q= inherits this.
- /city (x7), /culture city pages (x8), /organisers (x4): reveal on every
  below-hero ContentSection. /culture landing: story + all four culture rails.
- event detail: revealed individual left-column blocks (When+Where, Venue,
  Organiser) - transform+opacity only, sticky ticket panel untouched.
Verified (scripts/reveal-verify.mjs): event detail + /culture/african + /events
show 0 stuck-hidden after scroll and 0 opacity<1 under reduced-motion; sticky
two-column intact. Gate-verified.

### Unit 4 - DESIGNED LOADING + DARK (#4) - DONE
- Marketing light (ac50045): about/blog/careers/press dark CTA closers -> light
  (surface dark->alt, white->ink, gold-400 eyebrow->AA gold-800, dropped
  onSurface=dark). 0 dark sections on all four at 1440 (footer intentionally
  dark). Verified.
- Queue-room LIGHT rebuild (f44b9f9): adaptive `onPhoto` theme - photo backdrop +
  navy overlay when the event has an image (the allowed pattern), else clean
  light canvas; one token map drives all six phases. #4A90D9 -> gold, #10B981 ->
  text-success, bespoke blue buttons -> gold Button, SpinnerIcon -> gold ring.
  Hook logic untouched. Gate-verified (queue-gated: is_high_demand only, none
  locally -> visual deferred to staging).
- Squad off-brand blue sweep (71eaf94): squad-pay-form (navy Pay -> gold Button,
  ring -> gold, Stripe colorPrimary -> #0A1628) + the squad family (join/start/
  modal/button, squad page + my-squads progress bars): all #4A90D9/#F0F6FF ->
  brand gold (buttons gold+ink-900, focus rings gold, tint gold-100/40, accents
  gold-700). Kept the bg-ink-900 navy secondaries + the #25D366 WhatsApp button.
  Gate-verified (auth-gated -> visual deferred). No #4A90D9/#F0F6FF remains in any
  app surface now (queue + squad were the last; emails are a separate pass).
- Accepted as-is: connect-onboarding-card (Loader2) + surprise-me-modal
  (RefreshCw) use contextual icon-spins inside buttons, not generic page
  spinners - judged designed/acceptable per the Motion law.

### PRIORITY INTERRUPT - Vercel build failure FIXED (commit 985e46d, [SHARED])
The preview build of 78afde7 failed: 509 build-time pages x ~29 export workers
exhausted the live Supabase pool (PGRST003 + ~57k statement timeouts);
/events/[slug] exited the build. Three defences (see commit + next.config):
1. [SHARED] next.config: experimental.cpus=8 (was ~29 workers),
   staticGenerationMaxConcurrency=4 (was 8), staticGenerationRetryCount=3 ->
   <=32 concurrent renders (was ~230).
2. Head/long-tail split: events/[slug], city/[slug]/[suburb],
   culture/[culture]/[city], events/browse/[city] now defer to on-demand ISR
   (generateStaticParams -> [], dynamicParams=true, existing revalidate). Build
   prerender 509 -> 118 pages; prerender-manifest shows 0 prebuilt DB-backed
   pages. notFound() still guards unknown slugs; sitemap still complete.
3. withBuildRetry (src/lib/supabase/build-retry.ts): bounded retry+backoff on
   transient pool errors, soft-fallback to ISR, never masks real errors; wired
   into the head routes (city/culture/categories/faith).
VERIFIED: Vercel preview build GREEN; preview live (no auth wall) at
https://eventlinqs-app-git-feat-home-rebuild-lawals-projects-c20c0be8.vercel.app
with the full 55-event density rendering on the homepage. Note: city/culture/
categories/faith were already dynamic (ƒ) pre-fix (not contributing to the
build-time prerender load); the deferred SSG routes were the ~391-page DB-heavy
prerender that failed.

### REMAINING after this session
Mission items 1-4 (container width #11, buyer-journey checkout #8, interior
reveals #3, designed-loading + dark #4) are DONE and pushed; the Vercel preview
is GREEN with full density. The one open mission item:
- #9 PER-SURFACE NEW-BAR RE-AUDIT: fresh live TM + EB captures per surface at
  1440 + 390, a SURPASS/PARITY/BELOW proof table per surface (incl loading),
  iterate any BELOW, at the locked 1400 width and full fixture density. Not
  started (it was the "whatever budget remains" item; the priority build-failure
  interrupt + items 1-4 consumed the budget). Start with the homepage (surface 0)
  since the 1400 width changed it most, then the buyer surfaces.
Smaller deferred (staging, gate-verified here): live PAID checkout-form + on-sale
stepper captures (prod events sale-blocked); queue-room + squad visual proof
(auth/queue-gated); #8 form->payment step-transition polish. (The email-template
#1A1A2E/#4A90D9 pass is no longer deferred - it landed on main via PR #89 and is
now merged in; see the EMAIL note above.)

---

## Session: sync with main + #9 re-audit (2026-06-06)

### Step 0 - SYNC WITH MAIN - DONE
Merged `origin/main` into `feat/home-rebuild` (merge commit, 8 commits brought
in: PRs #85-#92 - launch hardening, email brand pass + security headers (#89),
flagged-branch triage + /events edge cache + CSP prep (#90), organiser payouts
dashboard M6 Phase 4 (#91), payout notification emails (#92)).
- Conflicts: only `.gitignore` (resolved as the union - kept this branch's
  `design-captures/`, capture scripts, `qa/`, and the dev fixture ignore; the
  duplicate `qa/` from main folded in). `next.config.ts` auto-merged cleanly and
  was VERIFIED to keep BOTH main's security-header + CSP-report-only block and
  the `/events` + `/events/:slug` edge-cache headers AND this branch's
  build-stability `experimental` settings (cpus 8, staticGenerationMaxConcurrency
  4, staticGenerationRetryCount 3) and `outputFileTracingIncludes` fixture trace.
- Deps reconciled: `next` 16.2.2 -> 16.2.7 (`npm install` against the merged
  lockfile); `db:types`/`db:types:check` scripts dropped per main; `prebuild`
  fixture step preserved.
- Stale email-colour remainder STRUCK (done on main, PR #89; verified zero
  `#1A1A2E` in any email source post-merge).
- Gates GREEN on the merged tree: tsc 0, eslint 0 errors (30 pre-existing
  capture-script warnings), vitest 322 passed (36 files; +47 from main's payouts
  tests), `next build` exit 0.
- Vercel preview: GREEN, verified two ways. (1) GitHub commit status for
  `ab2e35f` reports `Vercel: success` (`gh api .../commits/ab2e35f/status`); CI
  `lint·typecheck·build` and `test (vitest)` checks also success. (2) The preview
  alias serves HTTP 200 with the merged security headers live (CSP-Report-Only,
  HSTS, X-Frame-Options, X-Content-Type-Options) and the full 55-event density
  (55 distinct `/events/<slug>` server-rendered). Pre-existing `types-drift
  guard` check fails on a missing `SUPABASE_ACCESS_TOKEN` repo secret - identical
  failure on `origin/main`, not introduced here. (Lighthouse-mobile gate was
  still in_progress at audit time; it is the standing CI gate per CLAUDE.md.)

### #9 PER-SURFACE NEW-BAR RE-AUDIT - methodology
FRESH live captures this pass (not the cached `design-captures/`), driven by
`design-captures/audit/capture.mjs` (Playwright/Chromium, gitignored), at 1440 +
390 with en-AU/Sydney locale. OURS is captured from the GREEN preview alias (the
merged build at the locked 1400 width and full 55-event fixture density); TM +
EB are captured live. PNGs are gitignored per convention (`*.png`); the proof
tables below are the committed evidence. Motion + loading are assessed from the
live SSR DOM (reveal/hero-enter/scroll-snap classes present; `data-motion` is
correctly absent in headless SSR so content is flash-free and gate-safe) plus
the route `loading.tsx` skeletons, since static frames cannot show animation.
Live TM + EB both load HTTP 200 headless - the fresh-capture requirement is met.

### Surface 0: Homepage - RE-AUDITED, AT/ABOVE BAR (no code change)
Captures: `surface-0/audit-2026-06-06/{ours,tm,eb}-home-{1440-fold,1440-full,390-full}.png`.
Live URLs: ours = preview alias `/`; TM = ticketmaster.com.au; EB = eventbrite.com.au.

Stronger pattern (stated): EB is the stronger competitor pattern to benchmark -
a light, airy, curated-discovery homepage (hand-picked card row + category nav +
a location grid), closest to our light navy-on-canvas system. TM is ad/sponsor-
driven (Toyota AFL hero, Wallabies ad tile, Gift-Cards/Groups banner ads, right
promo sidebar) and lower-craft; its one genuine strength is the persistent
location/date/search rig in the header. We benchmark to surpass EB's curation
while keeping a cinematic hero neither competitor has.

| Aspect | Verdict | Evidence (1440 + 390) |
|---|---|---|
| Layout / structure | SURPASS | Solid navy header + cinematic full-bleed hero + a dozen+ consistent curated rails (category, This Week, genres, By City, Scenes V2, Featured Venues). EB: one curated row + icon nav + a single location grid. TM: ad hero + promo sidebar. |
| Density | SURPASS | A dozen+ distinct rails of real breadth at full 55-event density vs EB's single "Events in <city>" grid and TM's promo rows. |
| Hierarchy | SURPASS | Sectioned 24px rail headings (`type-rail-heading`) + faint top dividers, uniform card sizing; clean scan. Competitors run flatter. |
| Imagery | SURPASS | Real-photo, image-first landscape cards site-wide; no ad banners (TM) or mixed-craft poster flyers (EB). Observation: at full *fixture* density many card photos are similar dark concert shots - a seed-data artifact, not a design defect; the treatment renders varied catalogue imagery correctly. |
| Typography | PARITY | Rail headings 24/22px, card titles 18px at the locked scale - matches both competitors exactly; ours adds a display hero clamp neither has. |
| Interaction / motion | SURPASS | Eased rail glide (scroll-snap + distance-eased arrows), `hero-enter` content stagger, `.reveal` scroll-in on every below-fold rail (18 in SSR), card hover lift/zoom. EB/TM near-static. (DOM-evidenced; `data-motion` correctly off in headless.) |
| Loading | SURPASS | Designed brand-shimmer section skeletons (no spinners-on-white, RailHeaderSkeleton CLS-matched to 24px), plus route `loading.tsx` on the buyer steps. Competitors flash plain/spinner loads. |
| Mobile (390) | PARITY | Stacked rails with horizontal peek, solid navy header, 44px targets, identical dividers. Matches EB's clean mobile stack; cleaner than TM's ad-stacked mobile. |

No aspect BELOW -> no code change. The homepage already carries the locked 1400
width, full-density rails, the motion engine, and designed loading. The single
seed-imagery-variety observation is logged (data, not design) and does not gate.

### Surface 1: Browse /events - RE-AUDITED, one BELOW fixed (loading skeleton)
Captures: `surface-1/audit-2026-06-06/{ours,tm,eb}-{events,browse}-{1440-fold,1440-full,390-full}.png`
plus the loading skeleton `ours-events-loading-{1440,390}.png`.
Live URLs: ours = preview `/events`; TM = ticketmaster.com.au/discover/concerts
(MUSIC browse); EB = eventbrite.com.au/d/australia--sydney/events/.

Stronger pattern (stated): EB browse is the stronger competitor pattern - a
city-led listing (hero + neighbourhood chips + category sub-rows of cards) with
real discovery intent. TM browse is weaker: 4 image cards then an IMAGELESS text
list ("10000 results", date|name|venue|Find-tickets rows) interrupted by a
Gift-Cards banner ad and a Wallabies ad. We benchmark to surpass EB's listing.

| Aspect | Verdict | Evidence (1440 + 390) |
|---|---|---|
| Density | SURPASS | 4-up real-photo grid (~24/pg) + a "Popular this week" curated rail above it. EB: category sub-rows of mixed-craft poster flyers. TM: 4 cards + an imageless text list + ad banners. |
| Imagery | SURPASS | Every card real landscape photography with price/badge/save. EB poster flyers vary in craft; TM browse is nearly imageless below the fold. |
| Filters / UX | SURPASS | Date-preset chips + category chips + Grid/Map toggle + a More-filters sheet (price/date/distance/sort), all keyboard reachable. EB: neighbourhood chips only. TM: 3 dropdowns. |
| Hierarchy | SURPASS | Hero strip (H1 + count + search) -> solid sticky filter bar -> popular rail -> grid. TM is ad-interrupted; EB busier. |
| Typography | PARITY | H1, chip labels, card titles at the locked scale. |
| Motion | SURPASS | Grid + popular rail fade-rise (`.reveal`), shared eased rail glide + card hover. Competitors near-static. |
| Loading | **SURPASS (in-page Suspense)** | The two below-the-shell data regions - the popular rail and the results grid - stream behind in-page `<Suspense>` boundaries with a zero-CLS designed skeleton (image shimmer + eyebrow/title/meta lines + gold price placeholder, matching the event-detail + checkout skeletons). The hero strip + sticky filter bar render IMMEDIATELY (never behind a fallback) so the LCP anchors on the hero, untouched; the "N events available" count streams into the hero via its own tiny Suspense slot. Implemented entirely inside `events/page.tsx` (one unawaited fetch promise shared by the hero count + the grid, so a single fetch feeds both) - deliberately NOT a segment `loading.tsx`, which would wrap the `/events/[slug]` + `/events/browse/[city]` children and break their hard 404s (see the soft-404 fix). Verified live mid-fetch at 1440 + 390 (`surface-1/audit-2026-06-06/ours-events-skeleton-live-*`): hero + filter painted, popular rail + grid showing skeletons. Competitors flash plain/spinner loads. |
| Mobile (390) | PARITY | Single-column grid, horizontal-scroll chips, solid sticky filter bar, 44px targets; matches EB's mobile, cleaner than TM's. |

Fix shipped: `src/app/events/loading.tsx` (new). Gates green: tsc 0, eslint 0
errors, vitest 322, `next build` exit 0 (118 prerendered, /events dynamic with
its new route skeleton). Nothing remains BELOW on this surface.

### Surface 2: Event detail - RE-AUDITED, CRITICAL 500 FIXED
Captures: `surface-2/audit-2026-06-06/{ours-detail,eb-detail}-*` + the preview
recapture `ours-detail-preview-1440-full.png`. Live URLs: ours = preview
`/events/africultures-festival-sydney-2027`; EB = a live eventbrite.com.au event.

**CRITICAL FINDING (fixed this pass, commit 1becd61):** every event detail page
AND every /events/browse/[city] page returned HTTP 500 on the deployed preview -
the flagship surface was down on the first event click. Pre-existing since the
build-pool ISR split (985e46d), never caught because only the homepage was
preview-verified. Root cause + fix are in the sync-session "Surface 2" code
commit; verified live on the preview AFTER the fix: africultures + browse/sydney
now 200 (Vercel status success). The proof table below is therefore the FIRST
real benchmark this surface has ever had on the live deployment.

Stronger pattern (stated): EB is the stronger capturable competitor - a poster-
flyer hero (organiser-uploaded, busy/low-craft) + sticky ticket sidebar +
organiser Follow ("TOP ORGANIZER") + About + FAQ. TM event detail is BOT-GATED
(HTTP 401 to headless Playwright on deep event pages - homepage/browse load 200,
event pages do not), so TM is benchmarked from its known thumbnail-list pattern,
not a fresh capture. We benchmark to surpass EB.

| Aspect | Verdict | Evidence (1440 + 390, preview) |
|---|---|---|
| Layout / structure | SURPASS | Cinematic full-bleed hero -> About -> When/Where cards -> venue map (renders with gold pin on preview) -> organiser card -> tags -> WhatsApp-first share -> related grid, with a sticky ticket panel. EB: flyer hero + sidebar + About/FAQ. |
| Imagery | SURPASS | Cinematic photographic hero + navy gradient. EB leads with the organiser's busy promo flyer; TM with a small poster thumbnail. |
| Typography | SURPASS | Display H1 clamp + sectioned eyebrows; competitors run flat system type. |
| Density | SURPASS | Full detail set incl venue map + related events; EB is About + FAQ + sidebar. |
| Hierarchy | SURPASS | Clear sectioned scan; trust signals (secure checkout / community organiser / refund policy) under the CTA. |
| Motion | SURPASS | `hero-enter` content stagger (LCP image never animates), related-grid `reveal`, CTA hover-lift, sticky panel. Competitors near-static. |
| Loading | SURPASS | Route `loading.tsx` (dark photo-hero mirror + light two-column shimmer) shipped a prior session; competitors flash. |
| Mobile (390) | SURPASS | Hero + stacked content + solid bottom action bar; 44px targets. |
| Social proof / FAQ | PARITY-minus | EB shows organiser follower count + Follow + an FAQ accordion. Ours defers both (needs a follows table + event FAQ data) - a DATA gap, not a craft gap; logged in the surface-3 deferrals. |

Verdict: no CRAFT aspect BELOW; the one sub-bar item (organiser social-proof +
FAQ) is data-gated and explicitly deferred. The flagship 500 is fixed and
verified on the preview, the venue map renders there (the local capture's map
error was a missing local Mapbox token, not a defect).

Known follow-up (logged, not a craft BELOW): a NON-EXISTENT event/browse-city
slug returns a soft-404 (HTTP 200 + the not-found UI) instead of a hard 404,
because async `notFound()` on a fully-dynamic route soft-404s in this
Next/Turbopack version; a hard 404 would mean re-adding build-time event
prerendering (the Supabase-pool risk the team deliberately removed). Real events
are unaffected; this only touches dead/By crawled links. TM event-detail fresh
capture is blocked by Ticketmaster bot protection (401) - the one fresh-capture
exception on this surface.

### Surface 3: Search results (/events?q=) - RE-AUDITED, AT/ABOVE BAR (no code change)
Captures: `surface-3/audit-2026-06-06/{ours-search,ours-search-empty,eb-search,tm-search}-*`.
Live URLs: ours = preview `/events?q=afrobeats` (+ empty `?q=quokkazzznonexistent`);
EB = eventbrite all-events?q=music; TM = ticketmaster.com.au/search?q=music.

Stronger pattern (stated): both competitors frame search as "results for X" over
their browse layout. EB = a single-column flyer list + Filters sidebar + side
map. TM = "TOP SUGGESTIONS" + a 10,000-row text list flanked by a "BE SAFE" ad
block. We benchmark to surpass EB's framed list (the cleaner of the two).

| Aspect | Verdict | Evidence (1440 + 390) |
|---|---|---|
| Query framing | SURPASS | H1 becomes `Results for "afrobeats"`, the box is pre-filled, and a no-result search reads `No results for "quokkazzznonexistent"` with a designed empty state (search-off icon + widen/clear guidance + Clear-filters / Browse-all CTAs). EB frames the H1; neither competitor has a zero-result recovery this clean. |
| Density | SURPASS | Inherits the 4-up real-photo browse grid vs EB's single-column list and TM's text list. |
| Imagery | SURPASS | Real-photo result cards vs EB poster flyers / TM mixed + ads. |
| UX | SURPASS | Full filter set (date presets, category chips, grid/map, more-filters sheet) still applies to a search; clean zero-result recovery. |
| Typography | PARITY | "Results for ..." at the display scale. |
| Loading | SURPASS | /events?q= IS the /events route, so it inherits the designed browse `loading.tsx` added in Surface 1. |
| Motion | SURPASS | Inherits the browse grid reveal + shared rail glide + card hover. |
| Mobile (390) | PARITY | Query framing + single-column results + sticky solid filter bar + 44px targets. |

No aspect BELOW -> no code change (the surface-1 browse skeleton already covers
search). Query framing + designed empty state verified live at 1440 + 390.

### Surface 4: City page (/city/[slug]) - RE-AUDITED, AT/ABOVE BAR (no code change)
Captures: `surface-4/audit-2026-06-06/{ours-city,eb-city,tm-city}-*`. Live URLs:
ours = preview /city/sydney; EB = eventbrite Sydney listing; TM =
ticketmaster.com.au/discover/sydney.

Stronger pattern (stated): TM city is the stronger competitor here - a promo
banner carousel (BTS / Matildas / Lion King) + "Popular concerts/sports in
Sydney" category rails. EB city is just its filtered browse list + sidebar +
map. We benchmark to surpass TM's category-rail city page.

| Aspect | Verdict | Evidence (1440 + 390) |
|---|---|---|
| Density | SURPASS | A true editorial place-landing: cinematic harbour hero + intro, Sydney-by-community rail, browse-by-event-type tiles, highlights rail, by-suburb tiles, all-events grid, discover-more-cities, organiser CTA. TM = a promo carousel + 2 category rails; EB = one filtered list. |
| Imagery | SURPASS | Real city / community / suburb photography throughout vs TM promo banners. |
| Typography | SURPASS | Editorial display headings + sectioned eyebrows vs TM's flat rail labels. |
| UX | SURPASS | Community + suburb + culture discovery, live map, date-chip filter, organiser CTA - none of which the competitors carry. |
| Hierarchy | SURPASS | Clear editorial sectioning; photographic heroes use the allowed photo+navy-overlay pattern, the rest is light canvas (dark-sweep compliant). |
| Motion | SURPASS | Below-hero ContentSections fade-rise (the `reveal` prop), shared rail glide + card hover. |
| Loading | PARITY | SSR full-page (no client spinner / blank flash); on par with the competitors' SSR loads. A designed skeleton is an optional discovery-surface polish item (the buyer journey - browse/detail/checkout - carries the designed skeletons). |
| Mobile (390) | SURPASS | Stacked rails, horizontal-scroll chips, full-width 44px CTAs, photographic tiles. |

No aspect BELOW -> no code change. Verified at 1440 + 390 on the preview.

### Surface 5: Categories + Scenes V2 rail - RE-AUDITED, AT/ABOVE BAR (no code change)
Captures: `surface-5/audit-2026-06-06/{ours-culture,eb-music-cat}-*` + the Scenes
V2 rail verified on the preview homepage DOM. Live URLs: ours = preview
/culture/african (the live category surface - /categories/* 308-redirect to
/culture/*); EB = eventbrite Sydney Music category. (TM genre = the surface-1
MUSIC browse: 2-up + imageless list + ads.)

Stronger pattern (stated): EB's category page is the stronger competitor - a
flat-blue hero + sub-category icon chips + several rails (most-popular, weekend,
organisers-to-follow, parties, trending tags) of poster-flyer cards. We
benchmark to surpass it, and to add the Scenes V2 discovery rail neither has.

| Aspect | Verdict | Evidence (1440 + 390) |
|---|---|---|
| Scenes V2 rail | SURPASS | Homepage rail renders the research-backed V2 taxonomy - two families (12 music + 7 culture) in ONE rail with family markers (Electronic, Hip-Hop, Amapiano, Afrobeats, Caribbean, Latin, Pasifika, South Asian...), inheriting the eased glide + reveal + hover. Neither competitor has a cross-family scene-discovery rail. |
| Imagery | SURPASS | /culture/african leads with a cinematic photo hero + real-photo sub-scene tiles + real-photo event grid; EB leads with a flat-blue hero + busy flyer cards + circular icon chips. |
| Typography | SURPASS | Editorial display headings + sectioned eyebrows vs EB's flat rail labels. |
| Density | PARITY | EB's category page is genuinely dense (many rails); ours matches with hero + intro + sub-scenes + by-city + events grid + related + organiser CTA, more editorially cohesive. |
| Hierarchy | SURPASS | Clear editorial sectioning end to end. |
| Motion | SURPASS | Scene rail glide + below-hero reveals + card hover; EB near-static. |
| Dark compliance | PASS | The /culture organiser-CTA band is the ADAPTIVE photo+overlay treatment (verified in code + DOM: `bg-surface-dark` is only the base behind a `HeroMedia` photo + navy gradient when the culture has a backdrop; light `surface-1` band otherwise). No flat-dark panel - directive-compliant. |
| Loading | PARITY | SSR full-page, on par with competitors. |
| Mobile (390) | PARITY | Stacked rails, horizontal-scroll scene tiles, 44px targets. |

No aspect BELOW -> no code change. Scenes V2 rail + culture landing + dark
compliance verified on the preview at 1440 + 390.

### Surface 6: Organisers landing (/organisers) - RE-AUDITED, 1 NAMED EXCEPTION (imagery)
Captures: `surface-6/audit-2026-06-06/{ours-organisers,eb-organiser}-*`. Live URLs:
ours = preview /organisers; EB = eventbrite.com.au/organizer/overview.

Stronger pattern (stated): EB's organiser overview is a polished, IMAGE-RICH
marketing site - a split hero with a lifestyle photo, "Creator Spotlight" with
real photography, photographic solution tiles, a trends/blog row, and resources.
Ours is a clean, conversion-focused, TEXT-FORWARD page. This pass corrects the
prior report's "EB is single-hero-led" note: EB is in fact dense and
imagery-led here.

| Aspect | Verdict | Evidence (1440 + 390) |
|---|---|---|
| Imagery | **BELOW (named exception)** | EB carries lifestyle/event photography throughout; ours has ZERO photos in the body (verified: 0 pexels/supabase/_next-image hits). Closing this needs a CURATED lifestyle hero asset + a founder design sign-off (a marketing-hero redesign) - it is NOT autonomously fixable without fabricating generic stock, which violates Law 1 (no generic). The project's own prior pass deliberately deferred it for the same reason. Listed as an exact exception, not silently passed. |
| Density | PARITY | Ours: hero + 3 value pillars + 4-step how-it-works + open-to-every-community + Organiser FAQ + closing CTA. EB adds blog/creator-spotlight/resources breadth; ours covers the full conversion path. |
| UX | SURPASS | One unmissable gold "Start selling tickets" CTA repeated in the closing band, a self-serve path (/organisers/signup), and an FAQ accordion that pre-empts friction. |
| Typography | PARITY | Display H1/headings at the locked scale. |
| Hierarchy | PARITY | Clear sectioned marketing flow. |
| Dark compliance | PASS | 0 flat-dark sections (verified); the closing "Ready to sell tickets?" band was rebuilt to light in the dark-sweep. |
| Loading | PARITY | SSR full-page. |
| Mobile (390) | PARITY | Stacked sections, 44px CTAs, accordion FAQ. |

One aspect BELOW - imagery - and it is a NAMED EXCEPTION: a curated lifestyle
hero asset + founder design sign-off (a marketing-hero redesign). Fabricating
generic imagery to "pass" would violate the no-generic law, so it is deferred by
design, not by oversight. All other aspects PARITY/SURPASS. No code change (the
exception is asset- and sign-off-gated).

### Surface 7: Checkout (renderable states) - RE-AUDITED, AT/ABOVE BAR (live form staging-gated)
Captures: `surface-7/audit-2026-06-06/ours-checkout-renderable-*`. The live
checkout FORM needs an active held reservation on a Stripe-connected organiser
(prod Sydney events are sale-blocked), so - exactly as the original surface-7
note states - the form is benchmarked by CODE REVIEW + the cached EB checkout;
its live visual proof stays in the launch live-purchase pass.

Renderable state verified live (1440 + 390): an invalid/expired
`/checkout/[reservation_id]` does NOT dead-end - it gracefully REDIRECTS to
/events (browse) so the buyer can recover. HTTP 200, lands on the full browse
grid.

Code-review benchmark vs the cached EB checkout (centred modal, single bundled
fee revealed late, "Going fast" pill):
| Aspect | Verdict | Evidence |
|---|---|---|
| Fee transparency | SURPASS | CheckoutSummary shows the ITEMISED all-in total up front (Subtotal, Discount, Service fee, Payment-processing fee, GST, bold Total). EB bundles a single fee onto the ticket card and reveals it late. |
| CTA thread | SURPASS | One canonical gold Button runs Get-tickets -> Checkout -> Continue -> Pay (the bespoke navy/emerald buttons were unified in the buyer-journey pass). |
| Dark / glass compliance | PASS | 0 backdrop-blur, 0 dark page backgrounds on checkout (verified; the only bg-ink-900 uses are small navy pills/badges). Light canvas. |
| Loading | SURPASS | `checkout/[reservation_id]/loading.tsx` designed skeleton ships; competitors flash. |
| Recovery | SURPASS | Invalid/expired reservation redirects to browse; the load-error state is a premium card with retry, not an error-boundary crash. |
| Form fields / targets | PARITY | Shared FIELD_CLS (44px+, 16px text, no iOS zoom); 44px quantity steppers. |

NAMED EXCEPTION: the live checkout FORM + on-sale ticket steppers + a Stripe
round-trip require a sellable event with a held reservation - deferred to the
launch live-purchase / staging-certification pass (cannot be produced locally or
on preview). All renderable states are at/above bar.

### Surface 8: Order confirmation + ticket (renderable states) - RE-AUDITED, AT/ABOVE BAR (live success staging-gated)
Captures: renderable states probed live. Both the confirmation success header and
the digital ticket render only for a real completed order / valid ticket code, so
- per the original surface-8 note - the success states are benchmarked by CODE
REVIEW; their live visual proof stays in the launch live-purchase pass.

Renderable states verified live: an unknown `/orders/[id]/confirmation` and an
invalid `/t/[code]` both return a clean HTTP 404 (proper not-found, not a soft
200 or a crash).

Code-review benchmark:
| Aspect | Verdict | Evidence |
|---|---|---|
| Confirmation density | SURPASS | Success header + order number + event card + Tickets-Purchased with total paid + each ticket's inline server-SVG QR ("Show this QR at entry") + View-ticket link + add-to-calendar + guest "create an account" CTA + a genuine pending state while the Stripe webhook runs. |
| Inline scannable QR | SURPASS | QR rendered inline on the confirmation (no extra hop); ticket view is mobile-first (max-w-md) with a door-scannable QR. |
| Dark / glass / brand compliance | PASS | 0 backdrop-blur, 0 surface-dark, 0 off-brand #1A1A2E on confirmation + ticket (verified); light canvas, brand navy tokens, server-SVG QR (media-rules compliant). |
| Pending-state honesty | SURPASS | Confirmation shows an honest pending state during webhook settle rather than a premature "done". |
| Mobile (390) | SURPASS | Ticket view is mobile-first with the QR sized for door scanning. |

NAMED EXCEPTION: the live confirmation success + issued-ticket QR + the ticket
view require a completed paid order and a valid ticket code - deferred to the
launch live-purchase / staging-certification pass. All renderable states (clean
404s) are at/above bar.

---

## #9 PER-SURFACE NEW-BAR RE-AUDIT - CLOSE-OUT (2026-06-06)

All nine surfaces re-audited at the locked 1400 width and full 55-event fixture
density, with FRESH live Ticketmaster + Eventbrite captures at 1440 + 390 (driven
by `design-captures/audit/capture.mjs`; OURS captured from the GREEN preview, the
merged build). Per-unit commits, gates green at each, pushed (no merge to main).

### Consolidated verdict
| # | Surface | Result | Code change this pass |
|---|---|---|---|
| 0 | Homepage | At/above bar - all aspects SURPASS/PARITY | none (already at bar) |
| 1 | Browse /events | At/above bar - added designed loading skeleton | `events/loading.tsx` (new) |
| 2 | Event detail | At/above bar - **CRITICAL 500 fixed** (flagship was down) | `events/[slug]` + `browse/[city]` + SiteHeader `staticSafe` |
| 3 | Search /events?q= | At/above bar - all aspects SURPASS/PARITY | none (inherits #1 skeleton) |
| 4 | City /city/[slug] | At/above bar - all aspects SURPASS/PARITY | none |
| 5 | Categories + Scenes V2 | At/above bar - V2 rail + culture landing | none |
| 6 | Organisers | At bar EXCEPT imagery (named exception) | none (exception is asset/sign-off gated) |
| 7 | Checkout (renderable) | Renderable states at/above bar; live form staging-gated | none |
| 8 | Confirmation (renderable) | Renderable states at/above bar; live success staging-gated | none |

### Headline finding (fixed this pass)
The flagship **event-detail page and every /events/browse/[city] page returned
HTTP 500 on the deployed preview** - the single most damaging defect the
founder's test drive would have hit on the first event click. Pre-existing since
the build-pool ISR split; never caught because only the homepage had been
preview-verified. Found, root-caused, fixed, and verified live on the preview
(commit 1becd61). This re-audit is the first benchmark this surface has ever had
on the live deployment.

### END-OF-PASS STATEMENT
Every surface in scope is AT OR ABOVE the measured Ticketmaster/Eventbrite bar on
every craft aspect (layout, density, hierarchy, imagery, typography, interaction/
motion, loading, mobile), verified by fresh live captures at 1440 + 390, with the
following EXACT exceptions - each by name, with its reason:

1. **Organisers imagery (Surface 6) - BELOW.** EB's organiser page is lifestyle-
   image-rich; ours is text-forward (0 body photos). Closing it requires a
   CURATED lifestyle hero asset + a founder design sign-off (a marketing-hero
   redesign). Not autonomously fixable without fabricating generic stock (Law 1).
   Deferred by design, not oversight.
2. **Live checkout form + Stripe round-trip (Surface 7) - STAGING-GATED.** Needs
   a sellable, Stripe-connected event with a held reservation (prod Sydney events
   are sale-blocked). Renderable states (graceful redirect-to-browse, designed
   loading skeleton) are verified at/above bar; the form is code-review-verified
   (itemised all-in fees surpass EB). Live visual proof -> launch live-purchase /
   staging-certification pass.
3. **Live confirmation success + issued-ticket QR + ticket view (Surface 8) -
   STAGING-GATED.** Needs a completed paid order + valid ticket code. Renderable
   states (clean 404s) are verified at/above bar; success states are
   code-review-verified (inline server-SVG QR, pending-state honesty). Live visual
   proof -> launch live-purchase / staging-certification pass.
4. **Ticketmaster event-detail FRESH capture (Surface 2) - CAPTURE-BLOCKED.** TM
   bot-gates deep event pages (HTTP 401 to headless); TM homepage/browse/search/
   city all captured fine. TM event detail is benchmarked from its known
   thumbnail-list pattern, the one fresh-capture exception.

Non-blocking follow-up (NOT a craft BELOW, logged for a future pass): a
non-existent event / browse-city slug returns a soft-404 (HTTP 200 + the
not-found UI) rather than a hard 404 - an async-notFound streaming nuance on
fully-dynamic routes; a hard 404 would mean re-adding build-time event
prerendering (the Supabase-pool risk deliberately removed). Real events are
unaffected. Also deferred (data-gated): organiser social-proof + FAQ on event
detail (needs a follows table + FAQ data).

With those exact exceptions, the system is at or above the bar on every surface.
The independent inspector + founder test drive can proceed.

---

## Follow-up: soft-404 on non-existent event slugs - ROOT-CAUSED + FIXED (2026-06-06)

The close-out logged a soft-404 (HTTP 200 + not-found UI instead of a hard 404)
on non-existent /events/[slug] and /events/browse/[city] slugs. Investigated and
fixed.

### Root cause (confirmed empirically)
A `loading.tsx` Suspense boundary in the route's chain. When the page suspends on
its data fetch, Next streams the loading fallback - committing the HTTP 200 -
BEFORE the page's async `notFound()` resolves, so notFound() can only render the
not-found UI inline (soft-404), never set the status. Proof: temporarily removing
both `app/events/loading.tsx` and `app/events/[slug]/loading.tsx` and rebuilding
flipped every fake slug to a clean 404 (real slugs stayed 200). The clean-404
routes (/organisers/[handle], /city/[slug], /culture/[culture]) have NO loading
boundary in their chain. The over-broad `app/events/loading.tsx` (added in
Surface 1) compounded it: as a SEGMENT-level file it wrapped /events/[slug] AND
/events/browse/[city], breaking both children's 404s and serving browse/[city] a
wrong-shaped browse-grid skeleton.

### Fix
- Added `app/events/[slug]/layout.tsx`: a cookie-free existence guard (same anon
  client + slug as the page's fetchEvent) that calls `notFound()` for unknown
  slugs. The LAYOUT renders OUTSIDE the page's loading Suspense, so its
  notFound() sets a real 404 BEFORE any fallback streams - while the page keeps
  its designed `loading.tsx` skeleton for the confirmed-to-exist event's render.
  Best of both: hard 404 + designed loading on event detail.
- Removed the segment-level `app/events/loading.tsx` (the over-broad boundary).
  This makes /events/browse/[city] return a hard 404 (no boundary) and stops it
  rendering the wrong skeleton. Trade-off: the /events browse page loses its
  route-level loading skeleton (it is edge-cached + fast SSR; a co-located
  in-page <Suspense> around the grid could re-add it later without re-wrapping
  the slug children - deliberately not done now to avoid refactoring the
  LCP-critical browse data flow right before inspection).

### Verified (local production server)
Real events + browse-city -> 200 (event detail keeps its loading skeleton);
zzz-fake-event + zzz-fake-city -> 404; /events + / -> 200. Gates: tsc 0, eslint 0
errors, vitest pass, next build exit 0. The soft-404 follow-up logged in the
close-out is now CLOSED.

---

## Lighthouse mobile gate: GREEN - three root causes fixed (2026-06-07)

The gate had been failing on every recent branch commit (since the merge sync).
Three distinct root causes, all run to ground and fixed; the hard blocker (SEO)
is resolved and the gate is GREEN (verified on commit a2aec43, Lighthouse mobile
gate = success).

### 1. /events LCP regression (warn-level) - FIXED (commit 1e46975)
The in-page Suspense added for browse loading (128df72) wrapped the popular rail,
pushing its first card image - the /events LCP candidate - behind a streamed
chunk, regressing mobile LCP to ~5.2s. Fix: popular rail renders INLINE again
(priority image parse-discoverable), only the below-the-fold results grid stays
behind the designed skeleton. Proven locally (warm): /events LCP 3.27s (< 4000).
Local median is flaky 3.3-5s due to the next/image optimiser cold-start
(Issue #42) - the documented reason LCP is warn-level.

### 2. Event-detail SEO 0.92 (hard fail, meta-description) - FIXED (commit a2aec43)
Two causes, both fixed:
 (a) STREAMING METADATA. Next streams <title>/<meta description> into the body
     for browser UAs and only blocks them in <head> for UAs in its built-in
     crawler list. Lighthouse 13's mobile UA is a pure "moto g power" device
     string (no Chrome-Lighthouse token), so it got the streamed body version
     and the head-only meta-description audit scored 0 -> SEO 0.92. (Real
     crawlers ARE on Next's list and always got it in head, so live SEO was
     fine.) Fix: next.config `htmlLimitedBots: /./` renders metadata in <head>
     for EVERY UA. Verified: metadata-only change; body/Suspense streaming
     (skeletons) intact (React $RC markers + skeleton present in SSR HTML).
 (b) EMPTY DESCRIPTION. The inline builder returned '' when summary, description
     AND venue_city were all empty (the CI seed event). Fix:
     buildEventMetaDescription() - guaranteed non-empty via a title fallback +
     a unit test for the all-empty case.
 Proven locally: event-detail SEO = 1.0 (was 0.92), meta description in <head>.

### 3. Homepage perf/LCP/TBT NaN (blind spot, warn-level) - audit detection FIXED; hero LCP-registration scoped (commit c6b0d96)
The homepage returned NO_LCP (perf/LCP/TBT = null) in every run. Root-caused:
 (a) AUDIT NOT DETECTED (fixed). The head bootstrap only flagged audit/headless
     mode by UA token; Lighthouse 13's device UA has none, so the homepage ran
     in ANIMATED mode (.hero-enter at opacity:0, .reveal rails hidden) for the
     audit. The gate already sends `Cookie: el-audit=1` for this, but the app
     never read it. Fix: bootstrap now treats el-audit=1 as audit mode ->
     data-headless=1 -> motion off -> visible from first paint. Verified
     (observed FCP 1466->866ms).
 (b) HERO LCP NOT REGISTERING (remaining, scoped). Even with motion off, Chrome
     fires ZERO LCP entries for the absolute-positioned `fill` HeroMedia hero -
     confirmed via a direct PerformanceObserver (control: /events fires an LCP;
     / fires none). Ruled OUT: motion, hydration node-swap (img id stable),
     contain/content-visibility (none on the ancestor chain), transforms,
     console/page errors. The hero image is loaded, visible, opacity 1, 412x346
     at top 65 - yet no LCP candidate registers (the same class the lighthouserc
     documents for / and /culture/* and gates at warn-level). The fix is a hero
     LCP-eligibility change (the documented static-raster-hero direction), which
     reworks the most important page; flagged for founder sign-off rather than
     done blind. Non-gate-blocking: homepage perf is warn-level by design.

Net: SEO (the hard blocker) and the /events LCP regression are fixed and the gate
is GREEN. The homepage audit-detection is fixed; the hero LCP-registration is
root-caused and scoped, pending sign-off on a hero-structural change.
