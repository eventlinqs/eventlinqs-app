# THE EVENT LAUNCH KIT: Phase A audit + Phase B plan

Date: 2026-07-25. Author: design engineering session (read-only pass; no code
changed). Evidence: `docs/design/launch-kit-audit-2026-07-25/` (screenshots at
1440 and 390, the A4 poster PDF, the OG invitation card, `drive-results.json`,
and the two Playwright drive scripts that produced them).

Environment audited: the staging deployment `eventlinqs-staging.vercel.app`
(shares the TEST database; none of the current branch's uncommitted changes
touch a Launch Kit surface, verified against `git status`). All file:line
references are to the working tree at audit time.

Internal document: competitor names appear below as research context. None of
this language is for any public surface.

---

## Executive summary

The Launch Kit exists and is genuinely strong: one post-publish screen delivers
the live page link, a print-ready A4 QR poster, a designed invitation card,
one-tap tracked sharing for seven channels, the seat map preview, and honest
measured reach. The timed run went from wizard start to a fully rendered kit in
**17.6 seconds** (mechanical floor, human-cadence typing). The machinery behind
the promise is largely built.

The two findings that matter most:

1. **The number one finding: the auth wall sits before ALL value.** A stranger
   who wants to see anything render must sign up, verify email, log in, and
   create an organisation before they may type an event title. There is no
   anonymous render, no draft, no deferred email capture. The
   watch-it-render-then-give-us-your-email flow does not exist in any form.
   Evidence: `src/app/(dashboard)/layout.tsx:20` (`if (!user) redirect('/login')`),
   `src/app/(dashboard)/dashboard/events/create/page.tsx:13` and `:22-44` (org
   gate), screenshot `01-anon-create-wall-1440.png` (anonymous visit to the
   create route lands on `/login?redirect=%2Fdashboard%2Fevents%2Fcreate`).

A founder directive received during the audit added two further bars, both
researched live with cited sources in the Addendum below: the kit's generated
output must read as expert human work with zero AI tells (section C1), and the
seat tools are benchmarked against the industry's best with an honest
scorecard and a supremacy track (section C2).

2. **Requirement 6 fails as written.** The public event page cross-promotes
   four other organisers' events in a "You might also like" grid
   (`src/app/events/[slug]/page.tsx:1087-1090`,
   `src/components/features/events/related-events-grid.tsx:19`, screenshot
   `07b-event-page-full-1440.png`), and the sold-out state suggests related
   events too (`event-sold-out.tsx`, wired at `page.tsx:1029`). This is a
   deliberate demand-engine feature colliding with the researched organiser
   complaint. It needs a founder decision, not a silent change (options in
   Phase B).

---

## Phase A: honest inventory

Verdicts are BUILT, PARTIAL, or NOT BUILT. Every claim is from opened code or
the live drive; nothing is inferred from filenames, TODOs, or docs.

### 1. Event creation wizard: BUILT, 7 steps, timed

- **Steps (7):** Basic Details, Date & Time, Location, Event Media, Tickets,
  Settings, Review & Publish (`src/components/features/events/event-form.tsx:143-151`).
- **Minimum inputs to publish:** title + cover image. The publish button is
  disabled only on empty title, missing cover, or an in-flight upload
  (`event-form.tsx:1708`). Everything else defaults: start = now + 7 days, end =
  start + 2 hours, timezone auto-detected, one $0 AUD tier, public visibility
  (`getDefaultFormData`, `event-form.tsx:170-215`). Venue and category are
  optional.
- **Magic Start (AI quick-fill):** describe the event in one sentence and the
  draft fills title, description, category, dates, venue, and tiers, with a
  filled/unresolved summary and end-date clamps (`event-form.tsx:593-657, 672-691`).
  Flag `magic_start` defaults ON (`src/lib/flags.ts:22`).
- **Publish routes to the kit:** on publish (new event, kit flag on) the
  organiser is pushed to `/dashboard/events/[id]/launch-kit?published=1`
  (`event-form.tsx:510-514`). The review step sells the kit before the button
  (`event-form.tsx:1675-1681`).
- **TIMED RUN (measured, staging, 2026-07-25):**
  - Wizard start to publish click: **15.7s**. Publish to kit rendered: **1.9s**.
    **Total 17.6s.** Cover upload within that: 4.0s (real 561KB JPEG).
  - Method: Playwright typing at 28ms per character, a 1.2s orientation pause
    per step, one field set per step beyond the defaults, free event. This is
    the mechanical floor with human-cadence input, not a first-timer's think
    time. Honest read: a decided organiser with a cover photo ready clears 60
    seconds comfortably; a first-timer writing their own copy will take
    minutes. The leading competitor's public claim is under two minutes for a
    page with no promotional assets; this run produced page + poster + card +
    tracked links + reach in 17.6 mechanical seconds. The promise is
    achievable; the claim we publish must match what a real user experiences
    (see Phase B, metric 2).
  - Raw numbers: `launch-kit-audit-2026-07-25/drive-results.json`. Steps:
    `02a`-`02g` screenshots.

### 2. Seat and room mapping: BUILT (visual editor)

- **Route:** `/dashboard/venues/[id]/seat-maps`. The chart list + builder are
  `seat-maps-client.tsx` and `seat-map-builder.tsx` (786 lines) under
  `src/app/(dashboard)/dashboard/venues/[id]/seat-maps/`.
- **What the editor actually is:** a visual room studio on a dot-grid canvas:
  rows blocks, round tables, square tables, standing areas
  (`seat-map-builder.tsx:277-299, 350-353`), per-seat tools (toggle blocked /
  accessible / companion, remove, relabel, note), undo, zoom in / out / fit,
  section colours, live seat count, save as a reusable venue template
  (`:326-339, 404, 546-564, 635-639`). Evidence: `08c-seat-builder-empty-1440.png`,
  `08d-seat-builder-drawn-1440.png` (stage, 32 seats + standing zone drawn),
  `08e-seat-builder-390.png`.
- **Attachment:** wizard step 6 attaches a chart (`has_reserved_seating`,
  `venue_id`, `seat_map_id`, `event-form.tsx:86-91`); attaching copies seats so
  template edits never touch live inventory (`seat-maps-client.tsx:25-31`).
  Post-publish the kit shows the live room exactly as buyers see it
  (`launch-kit/page.tsx:463-515`), and `/dashboard/events/[id]/seats` manages it.
- **Friction noted for Phase B:** the room lives under Venues, a different nav
  area; an organiser must create a venue before they can draw a room. It is not
  in the one-minute path (correctly, it is optional).

### 3. QR poster generation: BUILT, print-ready, server rendered

- **Route:** `GET /api/organiser/events/[id]/poster`
  (`src/app/api/organiser/events/[id]/poster/route.ts`), organiser-gated
  (fails closed via `getOrganiserEvent`).
- **Format:** true A4 PDF (595.28 x 841.89 pt), built server-side with pdf-lib
  (`src/lib/broadcast/poster.ts:21-22, 59-173`): navy canvas, cover image
  cover-fitted to the top 55 percent (webp/avif converted via sharp,
  `route.ts:22-44`), gold-ruled info band, wrapped title, date in gold, price,
  a 600px tracked QR (channel `qr`) on a white block, the human-readable short
  URL, and a branded navy/gold fallback when no cover embeds. Text is vector;
  it is genuinely print-ready.
- **Every scan is measured:** the QR carries the event's tracked `qr` share
  link, so poster scans appear beside every other channel in reach. Downloads
  are recorded to `kit_poster_downloads` (`route.ts:106-113`).
- Evidence: `05-poster-a4.pdf` (downloaded live, HTTP 200).

### 4. Social share card generation: PARTIAL (one designed card, OG only)

- **What exists:** a designed per-event 1200x630 card rendered by
  `src/app/events/[slug]/opengraph-image.tsx`: cover photograph, the platform's
  bottom-up navy scrim, gold "You are invited" eyebrow, display-weight title,
  date and venue, EventLinqs wordmark. Every shared link unfurls as this card
  on every channel; the kit previews it and offers "Preview your card" with a
  right-click-to-save note (`launch-kit/page.tsx:412-460`). Evidence:
  `06-invitation-card-og.png` (fetched live, HTTP 200).
- **What does not exist:** per-platform designed artefacts (story 1080x1920,
  square 1080x1080, banner sizes), any download-the-set control, any
  event-type-aware art direction. One frame, one size, saved only via
  right-click. Against requirement 3 ("finished, designed artefacts per
  platform") this is PARTIAL.
- **Design note:** on this capture the title sits over a bright region of the
  photograph; the scrim holds legibility but only just. Phase B tightens it.

### 5. Tracked links and per-channel results: BUILT

- **Mint:** one short link per (event, channel, artist, creator), reused not
  re-minted (`src/lib/broadcast/share-links.ts:101-137`), cryptographically
  random base62 codes (`:42-49`). The kit pre-mints seven channels + `qr` in
  parallel (`launch-kit/page.tsx:49-57, 175-195`).
- **Redirect:** `/s/[code]` records the click, sets a last-touch cookie, 302s
  to the event page; forged or stale codes write nothing and degrade to browse,
  never a 404 (`src/app/s/[code]/route.ts:28-91`).
- **Honesty by construction:** views deduplicated per visitor per day,
  conversions capped at one per (link, order) by a unique index, conversion
  requires the link's event to match the order's event
  (`share-links.ts:139-182`, `recordShareConversionForOrder` on the
  confirmation page).
- **Attribution loops that exist today:** buyer share-a-ticket on the order
  confirmation, with the buyer's exact seat in the invite
  (`src/app/orders/[order_id]/confirmation/page.tsx:339-373`); the
  invite-an-organiser conversion link `via=organiser-invite` (`:375-385`); the
  lineup loop minting each tagged act their own attributed link and showing
  tickets per act (`launch-kit/page.tsx:167-171`, `lineup-loop-panel`).

### 6. Reach panel: BUILT (data), PARTIAL (plain English)

- `/dashboard/events/[id]/reach` shows four stat cards (link views, clicks,
  orders, tickets), a per-channel table (views / clicks / orders / tickets per
  channel), the share kit, the poster download, and an honesty footnote: only
  measured platform activity, never estimates
  (`src/app/(dashboard)/dashboard/events/[id]/reach/page.tsx:82-163`).
  The kit screen carries a compact version + top channels
  (`launch-kit/page.tsx:517-571`). The event dashboard adds Fill the Room
  (going / followers alerted / signups from shares,
  `src/components/features/dashboard/fill-the-room.tsx`).
- **Against requirement 4** (which channel actually sold tickets, in plain
  English, no dashboard literacy): the number IS there, in a table column. What
  is missing is the sentence: "WhatsApp has sold 9 of your 34 tickets. Your
  poster sold 4." PARTIAL.
- Evidence: `04-reach-panel-1440.png`, `04-reach-panel-390.png`.

### 7. Anonymous access: NOT BUILT. The first wall is before the first field.

Traced guards, in order, for a stranger who wants to create an event:

1. `src/app/(dashboard)/layout.tsx:20`: every dashboard route redirects to
   `/login` with no session. Confirmed live: anonymous
   `/dashboard/events/create` lands on
   `/login?redirect=%2Fdashboard%2Fevents%2Fcreate`
   (`01-anon-create-wall-1440.png`, `drive-results.json`).
2. `src/app/(dashboard)/dashboard/events/create/page.tsx:13`: second explicit
   auth check.
3. `create/page.tsx:22-44`: no organisation, no form; an organisation-create
   form interposes.
4. Signup itself has an email verification step
   (`src/app/(auth)/verify-email-sent/page.tsx` exists in the flow).
5. `EventForm` renders nowhere outside the dashboard (only importers:
   `dashboard/events/create/page.tsx`, `dashboard/events/[id]/edit/page.tsx`).

There is no guest draft, no local draft, no render-then-capture-email surface
anywhere. Value order today: account, email verification, login, organisation,
7 steps, publish, and only then the kit. This is the inverse of the brief's
architectural law and is the audit's number one finding.

### 8. One kit screen or scattered surfaces: BUILT, one screen

`/dashboard/events/[id]/launch-kit` presents the complete kit on one screen:
masthead with live link + copy, tracked share row, lineup loop, A4 poster with
a live scannable QR, invitation card preview, the seat map (seated events),
live reach with top channels, and next steps
(`src/app/(dashboard)/dashboard/events/[id]/launch-kit/page.tsx`). Publishing
lands the organiser here, never silently back on a table. A locked pre-publish
state explains what publishing unlocks (`:127-160`). Flag `launch_kit` defaults
ON (`flags.ts:19`). Evidence: `03-launch-kit-full-1440.png`,
`03-launch-kit-full-390.png` (both clean, no overflow).

### 9. Activation instrumentation: NOT BUILT for this funnel

Every analytics event that fires today (Plausible, via
`src/lib/analytics/plausible.ts` and all call sites, enumerated by grep):

| Event | Where it fires |
|---|---|
| `event_view` | event page (`event-view-tracker.tsx:22`) |
| `ticket_checkout_start` | ticket selector (`ticket-selector.tsx:131`) |
| `event_search` | events filter bar (`m5-events-filter-bar.tsx:71,86`) |
| `save_event` | save button (`save-event-button.tsx:58`) |
| `search_overlay_opened` / `search_submitted` / `search_suggestion_clicked` | header search (`header-search-overlay.tsx:118,218,331`) |
| `surprise_me_opened` / `surprise_me_refreshed` / `surprise_me_clicked` | homepage modal (`surprise-me-modal.tsx:50,75,144`) |
| `email_signup_submit_success` / `_error` / `_duplicate` | email panel + server action (`email-signup-panel.tsx:34,38`, `email-subscribe.ts:55,63`) |
| `account_sign_out` | auth action (`auth.ts:23`) |
| `ticket_purchase_complete` (server) | Stripe webhook (`webhooks/stripe/route.ts:484`) |
| `organiser_signup` (server) | organisation creation (`organisation/actions.ts:125`) |

Zero events cover the creation and kit funnel: no kit/wizard started, no step
progression, no publish, no kit rendered, no poster downloaded (the poster
writes a `kit_poster_downloads` DB row, a founder demand signal, but no
analytics event), no share-button tap. The four activation metrics in the
brief cannot be answered by any instrumentation that exists today.

### 10. The organiser-intelligence-engine plan: DOES NOT EXIST in this repo

`docs/superpowers/plans/2026-07-22-organiser-intelligence-engine.md` is not in
the repository. `docs/superpowers/` contains exactly two files, both from
2026-05-31 (the refund operator path plan + design spec). A repo-wide search
for "organiser intelligence" / "intelligence engine" (case-insensitive)
returns zero matches. NOT VERIFIED: there is nothing to summarise. If this
document exists outside the repo, it needs to be added; nothing was invented
to fill the gap.

### 11. The rules any new Launch Kit surface must obey (from CLAUDE.md + code)

- **Colour:** navy `#0A1628` + gold only. `--brand-accent` (gold-400) on dark
  surfaces and focus rings; `--brand-accent-strong` (gold-800) for gold text on
  light (`globals.css:18-28`). No new colours.
- **Type:** Archivo display, Hanken Grotesk body, Manrope UI. Rail headings
  `.type-rail-heading` 24px/22px w700 (`globals.css:292,303`); card titles
  18px; hero display `text-3xl sm:text-4xl lg:text-5xl`, never larger.
- **Container:** `max-w-7xl` = 1400px everywhere (`globals.css:61`).
- **Hero:** one scale, `.hero-marketing` 52/55/60vh, max 600px min 400px
  (`globals.css:353-358`); bottom-up navy scrim, gold eyebrow, bottom-anchored
  CTAs; the LCP raster never animates.
- **Motion:** CSS-first, IntersectionObserver reveals + keyframes, 150-300ms
  ease-out, staggers 50-80ms, armed only under `html[data-motion="1"]`,
  `prefers-reduced-motion` honoured; primitives `reveal.tsx` + `snap-rail.tsx`;
  no Framer Motion without founder approval; no GSAP, no scroll-hijack, no
  glassmorphism, no bento.
- **Surfaces:** solid and opaque; darkness only from a photograph + navy
  overlay; hover illumination v2 (brighten, never darken) via `HoverWash` +
  `.card-media-img`.
- **Media:** only through the media components (`EventCardMedia`, `HeroMedia`,
  `MarketingMedia`, tiles); no raw `img`, no `next/image` in feature code.
- **Copy:** Australian English; no em or en dashes; no exclamation marks;
  "community", never the banned word; no placeholders; competitor names never
  in public copy.
- **Fees:** any fee mention reads the live single source, never a hardcoded
  number.
- **Definition of Done:** benchmark gate at 1440/390, Lighthouse 95+, axe 0,
  zero dead links, real data, honest reporting.

---

## The 8 competitive requirements: where we stand today

| # | Requirement (must beat) | Verdict today | Evidence |
|---|---|---|---|
| 1 | Beat "page in under two minutes" with a full kit | **MET mechanically**: 17.6s wizard-start to rendered kit (typed at human cadence); publish-to-kit 1.9s | `drive-results.json`, item 1 |
| 2 | Visually distinctive, event-type aware, never a blank template | **PARTIAL**: kit, poster, card are strongly branded (navy/gold, cover-led) but identical for every event type; category data exists and is unused for theming | items 3, 4 |
| 3 | Finished print poster + designed share cards, not a share button | **Poster MET; cards PARTIAL** (one OG card, no per-platform set, no download control) | items 3, 4 |
| 4 | Reach tells which channel sold, plain English, no dashboard literacy | **PARTIAL**: per-channel tickets exist in a table; no plain-language verdict sentence | item 6 |
| 5 | Reach story includes NEW local buyers, not just past attendees | **PARTIAL**: the demand engine (feed, alerts, follows, who's-going) is built platform-side, and Fill the Room counts "signups from shares", but the kit itself never tells the new-local-buyers story | items 6, 5 |
| 6 | Our event page shows that event alone; zero cross-promotion | **FAILS today**: "You might also like" grid of 4 other organisers' events + sold-out related suggestions | `events/[slug]/page.tsx:1087-1090`, `07b-event-page-full-1440.png` |
| 7 | A stranger reaches a rendered kit with NO account | **FAILS today**: auth wall before the first field; no anonymous render of any kind | item 7 |
| 8 | Native, free turn-your-people-into-promoters | **MET**: share-a-ticket with seat-aware invites, the lineup loop (per-act tracked links + tickets-per-act), Fill the Room, all native and free | item 5 |

---

## Phase B: the plan

Design-lock honoured throughout: everything below is a NEW Launch Kit surface
or an addition inside an existing Launch Kit surface. The one existing-surface
question (requirement 6) is presented as a founder decision, not a change.

### B1. The gap, stated plainly

The kit is built; the funnel to it is inverted. Today the platform asks for
account, verified email, and an organisation before showing a single rendered
pixel. The promise requires: type details, WATCH page + poster + cards render,
THEN give an email to save and publish. Closing the gap is one new public
surface (the anonymous composer + kit reveal) plus four smaller additions
(theming, card set, plain-English reach, instrumentation). Nothing else on the
platform needs to move.

### B2. Screen-by-screen: the public Launch Kit flow

One new public route: **`/launch`** (working name; also the target of the
existing "It is free to start" acquisition loop links). Shared chrome, light
canvas, all tokens inherited. Four states, one page.

**State 1: The promise (entry).**
`.hero-marketing` hero from the licensed library (crowd-at-a-gig, navy scrim),
gold eyebrow "THE EVENT LAUNCH KIT", display headline "Build your event. Watch
your kit appear.", subline carrying the honest time claim (see B5, metric 2)
and "Free for free events". One primary control: the Magic Start describe-it
field (the same `MagicStart` component, public and rate-limited) plus a quiet
"or start from blank". No pricing tables, no feature grid, no second CTA.
The hero content staggers in per the Motion law; the raster does not.

**State 2: The composer (no account, one screen).**
A two-column canvas inside `max-w-7xl`: left, a single compact form (title,
date + time with today's smart defaults, venue name + suburb, cover upload
with instant preview, free / paid toggle with one price field, category
select); right, a **live preview that assembles as they type**: the event card
and the page hero building word by word. This is the first "watch" moment and
the anti-generic proof: their photo, their title, in the platform's design,
within seconds. Draft state lives client-side (localStorage) until the email
gate; no junk rows server-side. Wizard steps 2-6 features (tiers, seating,
squads, visibility) are deliberately NOT here; the composer feeds the existing
wizard after save for deep edits.

**State 3: THE REVEAL (the highest-leverage moment in the product).**
On "Create my kit", the composer collapses and the kit renders in front of
them, staged, on the light canvas:

1. 0ms: the page card wipes up (fade-rise 16px, 240ms ease-out), gold eyebrow
   "YOUR LAUNCH KIT" above it.
2. +180ms: the A4 poster slides in beside it; its QR block draws in last
   (opacity + 1.02 settle) so the eye lands on the scannable square.
3. +360ms: the invitation card slides in third, cover-led.
4. +540ms: the tracked share row pops beneath all three, one 60ms stagger per
   channel button.
5. +900ms: the save bar rises from beneath the kit: "This kit is yours. Save
   it and publish free." + one email field.

All CSS keyframes and transitions, 150-300ms per element, one orchestrated
sequence armed under `html[data-motion="1"]`; reduced-motion and no-JS get the
final state instantly. No Framer Motion needed. The artefacts are REAL, not
mockups: the poster is the real renderer's output for their draft, the card is
the real OG treatment, the QR resolves to the draft preview (labelled "goes
live the moment you publish", never a dead scan; it lands on the draft preview
page until then). Zero fabrication: if the cover upload failed, the branded
fallback renders, exactly as the shipped poster does.

**State 4: Save and publish (the email gate, after value).**
Email → existing signup/verify plumbing (magic-link preferred), organisation
auto-created from one pre-filled "Who is running this?" name field, the draft
persisted to the real event row, and the organiser lands on the EXISTING
launch-kit screen with `?published=1` once they hit publish. The existing kit
screen does not change. Abuse posture: rate limits on Magic Start and uploads,
same upload cap + compression as the wizard, drafts never public, no
server-side rows before the email gate.

### B3. The 8 requirements: the visible thing, and how we verify it

| # | What an organiser will SEE | Verification |
|---|---|---|
| 1 | Their kit rendered in front of them in well under a minute from first keystroke | The timed Playwright drive (this audit's script, re-run on the new flow) reports first-input-to-reveal; the honest number goes in the copy |
| 2 | Their event type changes the kit: a comedy night, a worship service, and a club night get different eyebrow language, poster accent treatment, and card copy (within the navy/gold system, no new tokens) | Side-by-side kit renders for 3 categories at 1440/390; benchmark verdict per aspect |
| 3 | A "Download your kit" row: A4 poster PDF, story card 1080x1920, square card 1080x1080, invitation 1200x630, each a finished designed file | Files download 200, open at declared dimensions, pass visual QA on real events with and without covers |
| 4 | One sentence above the reach table: "WhatsApp has sold 9 of your 34 tickets. Your poster sold 4." | Unit-tested sentence builder over `fetchReachSummary`; screenshot on a live event with mixed-channel sales |
| 5 | A kit band stating the platform story in plain terms: "Your event is in the discovery feed and city alerts from the moment you publish", with the measured counts (followers alerted, signups from shares) beside it | Counts sourced from the same queries as Fill the Room; no estimated numbers, ever |
| 6 | FOUNDER DECISION REQUIRED. Options: (a) remove the related grid from event pages entirely (organiser-first, matches the research); (b) show it only below the fold for FREE events; (c) per-organiser toggle, default off. The wedge pitch ("your page sells your event alone") only becomes true and provable with (a) or a default-off (c) | Zero-cross-promotion assertion added to the link-integrity/QA pass: no other event's card renders on `/events/[slug]` |
| 7 | A stranger with no account watches their real kit render at `/launch` | Anonymous Playwright run reaches the rendered reveal with no session cookie; the auth wall proof from this audit re-run against `/launch` shows no redirect |
| 8 | Unchanged (already native and free), plus the reveal's share row makes it visible pre-publish | Existing attribution proofs; `signups from shares` moving on a drive |

### B4. Activation metrics (instrument BEFORE the new flow ships)

Four events, named now, wired through the existing typed Plausible lib
(`src/lib/analytics/plausible.ts`), server-side where trust matters:

1. `kit_started`: first meaningful input in the composer (or wizard step 1
   today), client-side, once per draft.
2. `kit_rendered`: the reveal completes (today: the launch-kit screen renders
   post-publish), client-side with event id.
3. `email_captured_after_render`: the save-bar email submits after a rendered
   kit (today: nearest equivalent is signup completing with a draft pending),
   server-side.
4. `event_published`: server-side in the publish action (today this exists
   only as a DB state change, not an analytics event).

Instrumenting these on the EXISTING funnel first gives the baseline the new
flow must beat, and it is hours of work. The funnel view
kit_started → kit_rendered → email_captured → published is the activation
story; most product-led companies never instrument it, which is exactly why we
will.

### B5. Build sequence, ordered by impact per hour (honest estimates)

| Order | Work | Est. | Why this order |
|---|---|---|---|
| 1 | Instrument the four activation events on the existing funnel | 2-3h | Baseline before surgery; trivial risk; the strongest predictor of conversion becomes visible immediately |
| 2 | Plain-English reach verdict sentence (kit + reach panel) + the new-local-buyers band in the kit | 3-5h | Two PARTIAL requirements (4, 5) close with copy + one query reuse; zero new architecture |
| 3 | Event-type-aware kit theming: per-category eyebrow/copy set + poster accent + card line, within existing tokens | 4-6h | Kills "generic and cold" (requirement 2) across poster, card, and kit in one pass; pure content + small renderer params |
| 4 | The share-card set: story 1080x1920 + square 1080x1080 via the same ImageResponse pipeline + a "Download your kit" row | 6-9h | Requirement 3 fully MET; reuses the proven OG treatment at two more geometries |
| 5 | The public `/launch` composer + reveal + email gate + org auto-create | 20-30h | The architectural fix (requirement 7) and the signature moment; biggest single lever on organiser acquisition; sequenced last so it lands on instrumented rails with themed, downloadable artefacts already in the reveal |
| 6 | Requirement 6: founder decision, then gate the related grid per the chosen policy | 1-2h after decision | The change itself is small; the decision is strategic (demand engine vs organiser wedge) and is not mine to make |

Total to the full promise: roughly 36-55 focused hours after the founder
decisions. Items 1-4 are each independently shippable and each independently
improves the kit that already exists.

### B6. Founder decisions required before Phase C

1. **Requirement 6 policy** (related events on event pages): remove, free-only,
   or per-organiser toggle. The wedge claim cannot be published until decided.
2. **The public time claim**: publish the measured number honestly ("about a
   minute" only if the measured typical run supports it; ACCC exposure if not).
3. **Draft persistence**: client-only until email (proposed) vs server drafts
   with signed tokens (survives device switch, costs junk-row hygiene).
4. **`/launch` route name** and where it enters the header/footer (touches
   shared chrome, which is design-locked).
5. **The missing organiser-intelligence-engine plan doc** (item 10): supply it
   or confirm it does not exist.

---

## Addendum (founder directive, 2026-07-25): the human-grade bar and the industry benchmark

Two directives arrived during this audit: the kit's final output must read as
expert human work with zero AI traces and beat every rival AI tool, at a
professional (doctorate-grade) level of event-creation knowledge for every
event type; and the seat tools must be verified against the industry's best,
with research-backed upgrade recommendations. Both were researched live
(2026-07-25) with sources; nothing below is from memory.

### C1. The output bar: expert human work, zero AI traces

**What the market ships (researched, cited).**

- Eventbrite is the only major incumbent with in-product AI generation
  (descriptions, summaries, images since 2023; AI ad copy paywalled behind
  Boost at USD 15-100/month), and frames its own output as "a starting point
  for them to revise and edit". Humanitix ships no AI generation. TryBooking
  ships none, and Australian newcomer Ticket Deck attacks exactly that gap
  with describe-it drafting. Ticket Tailor outsources to an MCP connector and
  tells organisers to use ChatGPT.
  (eventbrite.com/blog/press/newsroom/eventbrite-introduces-ai-powered-tools...,
  techcrunch.com/2023/05/09/eventbrite-integrates-gpt-capabilites...,
  ticket-deck.com/compare/trybooking, tickettailor.com/features/ai-mcp-connector)
- **No surveyed platform renders a finished promo kit (poster + social cards +
  tracked links) at publish.** Verified as absent across Eventbrite, Humanitix,
  Ticket Tailor, TryBooking, Megatix, Eventix/Weeztix, Skiddle, TicketSource,
  PromoTix, Ticket Deck; PosterMyWall comes nearest but is a design tool the
  user must drive. A universal negative cannot be absolutely proven; it held
  across every platform surveyed. Our kit is already past all of them on this
  axis; the composer + reveal (B2) extends the lead.
- The "AI tells" are now a public, culturally recognised catalogue audiences
  scan for: em-dash overuse (the "ChatGPT hyphen", Rolling Stone), "not just
  X, it's Y", rule-of-three padding, "look no further", "unforgettable",
  "vibrant", "nestled", "in the heart of", "elevate", "unlock", significance
  inflation. (en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing,
  rollingstone.com/culture/culture-features/chatgpt-hypen-em-dash-ai-writing-1235314945)
- AI image models still garble poster text (glyph pattern-matching, ~40-95%
  text accuracy depending on model), and un-customised template tools carry
  the recognisable "Canva Look".
  (uxdesign.cc/lost-for-words-why-text-in-ai-images-still-goes-wrong-b5232c39bd11,
  aiflowreview.com/canva-magic-studio-review)
- Professional event copy is register-specific: rhythm-driven and lineup-led
  for music, outcome-and-numbers for corporate, casual and communal for
  comedy; benefit-led always; the headline carries roughly 80 percent of
  readers; truth-backed urgency only; no all-caps sells.
  (ticketfairy.com/blog/mastering-event-copywriting-in-2026...,
  eventbrite.com/blog/ultimate-copywriting-guide-events)

**Where we stand today (verified in code).** Magic Start
(`src/lib/ai/magic-start.ts`) already enforces at the AI boundary: Australian
English, no em or en dashes, the banned word, no competitor names, no invented
facts (unstated fields returned empty and named in `unresolved`, never
guessed), untrusted-input wrapping, a JSON schema, a cost guard, and a "never
a generic template" instruction (`buildSystem`, `:115-134`). The mechanical
output gate `enforceCopyLaws` (`src/lib/ai/sanitise.ts:66-71`) strips DASHES
ONLY. The model is Haiku 4.5 (fast extraction tier), overridable via
`AI_MAGIC_START_MODEL` (`:16-18`).

**The plan to surpass (upgrades, each verifiable).**

1. **Make anti-tell mechanical, not hoped-for.** Extend `enforceCopyLaws`
   into a two-layer gate: (a) hard strips (dashes, exclamation marks in
   user-facing copy, the banned word); (b) a banned-lexicon and pattern list
   from the researched catalogue (unforgettable, look no further, elevate,
   unlock, vibrant, nestled, in the heart of, stands as a testament, "not
   just X, it's Y") that fails the draft and triggers ONE regeneration with
   the violations named, then falls back to returning the field empty and
   flagged in `unresolved` rather than shipping a tell. Unit-tested; the same
   lexicon becomes the CI copy-grep gate the constitution already wants.
2. **Per-event-type voice registers, doctorate-grade.** Extend `buildSystem`
   with a register block selected by category: music (lineup-led, rhythm,
   concrete set times), comedy (casual, communal, no hype), corporate
   (outcomes, numbers, "500+ peers" style truths), family (practical
   reassurance: times, parking, pram access), community and faith (the
   community's own language, dignity, zero marketing froth), festivals
   (scale + logistics truths). Every register mandates: benefit-led opening,
   the headline does the selling, only truths the organiser stated, and the
   professional production details the platform already knows (door time,
   room, price, accessibility) woven in. This is where the professional
   event-production knowledge lives, per type, for every type.
3. **Two-pass quality option.** Keep Haiku for field extraction (speed is the
   product); run the description pass on a stronger model behind the existing
   `AI_MAGIC_START_MODEL` seam when configured. Founder decision 6: whether
   the copy pass warrants the stronger model's latency and cost.
4. **Typography renders every word; image models render none.** Our poster
   and cards are typeset (pdf-lib, ImageResponse) over the organiser's real
   photograph or licensed photography. This is already the architecture; the
   research (garbled AI poster text, the Canva Look) makes it law: no
   generated imagery, no generated glyphs, anywhere in the kit.
5. **Free and attributed, where rivals paywall.** Eventbrite paywalls AI ad
   copy; attribution is a USD 29/month bolt-on in the Megatix world (Seeka).
   The kit stays free, and every artefact carries a tracked link, which feeds
   both wedge blades.

**Verification of the bar itself:** the banned-lexicon unit tests plus grep
gate (machine-checked); a blind reading panel (founder plus two real
organisers) comparing our generated copy against incumbent output across
three categories, repeated until ours is picked as the human-written one;
and no public "AI" claim anywhere in the product (the output IS the product).

### C2. Seat tools versus the industry's best

Research summary (cited): Seats.io is the specialist benchmark (curved
sections with smoothing, reference-image tracing, "Scan a chart" from a floor
plan, a documented 7-step best-available cascade with focal point, orphan
prevention and accessible-seat mixing, multi-floor, view-from-seat; priced
per used seat at roughly EUR 0.12-0.18, about AUD 0.20-0.30, on top of
ticketing). Ticketmaster's buyer map adds price-range filtering and 3D
Virtual Venue at arena scale. Humanitix's builder is strong at the small tier
(tables, rows, ticket-type mapping, attendee moves with auto-updated tickets,
attendee self-move) but has no curves, no focal point, no auto-assignment.
Eventbrite's designer is reviewed as clunky and inflexible for gala
table-picking and cannot be edited on mobile. Orphan-seat prevention is a
headline feature industry-wide. (seats.io/features, docs.seats.io/docs/api/best-available,
help.ticketmaster.com/.../interactive-seat-map, help.humanitix.com/.../8905642,
capterra.com/p/114949/Eventbrite/reviews, ticketsource.com/.../seating-plan-designer,
creators.tixr.com/products/reserved-seating)

**Honest scorecard against the researched top-10 for our segment** (our side
verified in code and in this audit's captures):

| Capability (industry bar) | EventLinqs today | Evidence |
|---|---|---|
| 1. Self-serve builder: rows, tables, GA areas, mixed reserved + GA | BUILT | `seat-map-builder.tsx`, capture `08d` |
| 2. Ticket-type mapping and tiered pricing per section | BUILT (tier binding at attach, per-seat `price_cents`); no price books or channel pricing | builder panel, `seats` schema |
| 3. Best-available with contiguity, focal point, orphan prevention | PARTIAL: client-side contiguous same-row runs then scattered fallback (`seat-selector.tsx:363-411`); no focal point, no orphan prevention, no accessible mixing, no cascade | code read this audit |
| 4. Real-time holds, timeout, double-booking prevention | BUILT (reservation holds + expiry sweeper + proven one-winner concurrency) | prior verification docs |
| 5. Mobile buyer map: pinch zoom, pan, tap, price filter | BUILT except the price-range filter (NOT BUILT) | `seat-selector.tsx:102-215` |
| 6. Post-sale: move attendee, auto-updated tickets; attendee self-move | BUILT (move + email, `reassign_ticket_seat`); self-move NOT BUILT | prior verification docs |
| 7. Accessible seating: designated + companion, mixable into auto-assign | BUILT in builder and legend + per-seat aria; accessible-in-best-available NOT BUILT | `seat-map-builder.tsx`, `seat-selector.tsx:617-627` |
| 8. Real-layout fidelity: curved rows, reference-image tracing | NOT BUILT (straight blocks only) | builder code + capture |
| 9. Reusable venue templates, copy-on-attach isolation | BUILT | `seat-maps-client.tsx:25-31` |
| 10. Seat-view previews / 3D | NOT BUILT (industry ranks it last for sub-arena scale) | research |

Where we are already AHEAD at our tier: one-tap whole-table booking (the
exact gala pain Eventbrite is criticised for, `seat-selector.tsx:413`), the
kit's live room preview, per-seat relabelling and notes, the
organiser-assigns flow, and price: the specialist benchmark costs about
AUD 0.20-0.30 per seat on top of ticketing; ours is native and free. That is
wedge material and should be said on the organiser pitch (in our own words,
no competitor names).

**Upgrade recommendations, ordered by impact per hour (the supremacy track):**

| Order | Upgrade | Est. | Closes |
|---|---|---|---|
| S1 | Best-available v2, server-side: per-chart focal point, orphan-seat prevention on by default, accessible+companion mixing, graceful cascade (contiguous rows, then scattered, then whole table, then GA) | 8-12h | Row 3, the reference-implementation gap |
| S2 | Orphan guard at buyer selection (never strand a single seat; warn or auto-adjust) | 3-4h | Row 3's most visible half, revenue protection |
| S3 | Curved rows (curve + smoothing on rows blocks) plus a reference-image underlay in the builder canvas | 14-22h | Row 8, the number-one fidelity complaint against the mass-market tools |
| S4 | Price-range highlight on the buyer map | 3-5h | Row 5 |
| S5 | Attendee self-move from the ticket (flag-gated, organiser opt-in) | 6-8h | Row 6 |
| S6 | PARKED: 3D view-from-seat. Wrong cost-benefit below arena scale per the research; revisit at arena-scale venues | - | Row 10 |

With S1-S4 shipped, the builder plus buyer map meet or beat every
capability on the researched top-10 list for our segment except 3D, which the
industry itself ranks last there. That is a defensible "best in the industry
at our tier" claim, provable line by line; it is not honest to claim it today,
and this report does not.

### C3. Additions to the founder decision list

6. Magic Start copy pass model: keep Haiku-only, or two-pass with a stronger
   model behind `AI_MAGIC_START_MODEL` (latency and cost versus copy grade).
7. The supremacy track (S1-S5) priority relative to the Launch Kit build
   sequence in B5: interleave, or kit first then seats.

---

## Evidence index

All in `docs/design/launch-kit-audit-2026-07-25/`:

| File | Shows |
|---|---|
| `01-anon-create-wall-1440.png` | Anonymous visit to the create route: the login wall (finding 1) |
| `02a`-`02g` wizard steps (1440; `02a` also 390) | All 7 wizard steps as driven, real data |
| `03-launch-kit-full-1440.png` / `-390.png` | The complete kit screen, desktop + mobile |
| `04-reach-panel-1440.png` / `-390.png` | The reach panel |
| `05-poster-a4.pdf` | The real downloaded A4 poster (open it; the QR scans) |
| `06-invitation-card-og.png` | The real 1200x630 invitation card |
| `07a/b-event-page-*` | The public event page; `07b` bottom shows the cross-promotion grid (requirement 6) |
| `08a-08e` | Venues list, chart list, the room builder empty and drawn, builder at 390 |
| `drive-results.json` | Timings + checks from the drive |
| `lk-audit-drive.mjs`, `lk-audit-builder.mjs` | The scripts that produced all of the above (rerunnable) |

Artefacts created on TEST during this audit (kept, harmless, flagged for
hygiene): one published free event "Winter Warmers: Geelong Comedy Gala"
(id `7a391e37-3473-4b41-bcce-517daf76458d`) and one venue "The Wool Store"
under the broadcast-gate test organisation.
