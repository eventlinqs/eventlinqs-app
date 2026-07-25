# Phase C: kit items, rulings, and the /launch spec

Date: 2026-07-25. Companions: `docs/design/SEATING-SUPREMACY.md`,
`docs/design/SEATING-VISUAL-COMPARISON.md`, evidence in
`docs/design/phase-c-2026-07-25/`, roast ledger in
`docs/roast/phase-c-launch-kit-seating-2026-07-25.md`. The roast gate block
at the top of the delivery report governs; this file is the substance.

---

## Part 0: the organiser intelligence engine, recovered

Both files existed on branch `docs/organiser-intelligence-engine-spec` and
were cherry-picked (file checkout, no merge) onto the launch line in commit
`bc1465a`:
`docs/superpowers/plans/2026-07-22-organiser-intelligence-engine.md` and
`docs/superpowers/specs/2026-07-22-organiser-intelligence-engine-design.md`.

**What they propose and how much is built, in ten lines:**

1. A Python prospecting pipeline in the sibling repo
   `eventlinqs-organiser-engine` that reads two public Victorian event
   sources (the Beat gig guide and the City of Greater Geelong events page)
   and hands the founder a ranked organiser contact list workable at
   fifteen conversations a day.
2. It detects which ticketing platform each organiser sells through from
   outbound ticket links, scores seven components (activity 25, recency 18,
   live-on-sale 15, niche 14, audience 12, switchability 9, corridor 7),
   and tiers prospects A to D.
3. Three legal rails are absolute: no email harvesting (the only email
   regex lives in guards.py, enforced by a test), robots.txt honoured
   fail-closed, and zero requests ever issued to a ticketing platform
   domain.
4. Provenance is the hard invariant: every claim traces to a URL and a
   timestamp, because an unauditable row starts an argument with a real
   business.
5. Its measured Victorian platform mix (Oztix 24, Humanitix 18, TryBooking
   10 ticket links on one Beat page) redirects the outreach wedge: the
   Eventbrite opening is close to irrelevant for Victorian live music, and
   Oztix and Humanitix sellers are the real corridor.
6. Slice 1 deliberately stops for founder review before scaling beyond the
   two sources.
7. Built so far in the sibling repo: scaffold, models, guards, collect,
   platform detection, both parsers, and resolve, with tests and committed
   golden fixtures (plan tasks 1 to 8; SDD reports exist through task 8).
8. Not built: score.py, export.py (the tracker write), verify_queue.py,
   and run.py with the acceptance gate (tasks 9 onward).
9. That is roughly two thirds of slice 1 by module count; the pipeline
   cannot yet produce the tracker output end to end.
10. The spec is founder-approved (2026-07-22) and can no longer be lost:
    it now lives on the launch line.

## Part 1: founder rulings, recorded as executed

- Cross-promotion REMOVED from the event page (C1, commit `b253057`).
- Public time claim: "in under a minute", never a second count, never a
  competitor name or number in public copy: encoded in the /launch spec
  copy below and in the C3 gate (competitor names fail generated copy and
  the repo grep).
- Draft persistence: server-side keyed to a signed cookie: specified below
  (the `el_kit_draft` cookie contract shipped in C2 ahead of the build).
- Route `/launch` with the primary header CTA: specified below, spec only.
- Two-pass copy: shipped in C5 (commit `75aea92`).

## Part 2: the kit items as built

- **C1** (commit `b253057`): `RelatedEventsGrid` removed from
  `/events/[slug]` along with the sold-out related suggestions and the
  now-orphaned component file; 111 lines of cross-promotion machinery
  deleted. The page sells that event alone. Before and after captures in
  the evidence folder.
- **C2** (commit `782c09c`): the four activation metrics instrumented and
  unit-proven (18 tests): `kit_started` (wizard first input or Magic Start
  draft, once per session), `kit_rendered` (kit screen, delivery moment
  flagged), `event_published` (server side on all three first-publish
  paths), `email_captured_after_render` (signup carrying a valid
  `el_kit_draft` cookie, guard unit-tested against junk). Client events
  land through the layout's Plausible queue; server events post to the
  Plausible events API for domain eventlinqs.com.
- **C3** (commit `e3022d3`): the two-layer anti-tell gate. Layer 1
  (`enforceCopyLaws`) strips dashes and exclamation marks. Layer 2 (the
  researched lexicon, one source in `copy-tells.json`) fails a telling
  draft, regenerates ONCE with violations named, then blanks and flags a
  still-telling field. 34 tests, one per banned pattern plus flow tests.
  The same lexicon gates the repo's own copy strings in CI (the
  `copy-tell-gate` step), allowlist reasons on record.
### C3: every banned pattern, before and after (all test-asserted)

Each row is proven by a named test in `tests/unit/copy-tell-gate.test.ts`
(the before sentence is the test fixture) plus the flow tests in
`tests/unit/magic-start-gate.test.ts` (what "after" means: hard strips are
rewritten in place; lexicon hits trigger one named-violation regeneration,
and a still-telling field ships blank and flagged, never with the tell).

| Pattern | Before (caught fixture) | After (the gate's output) |
|---|---|---|
| unforgettable | "An unforgettable night of live music awaits." | regenerated; if still telling, field blanked + flagged |
| look-no-further | "Look no further for your Saturday plans." | regenerated, else blanked + flagged |
| stands-as-a-testament | "This festival stands as a testament to local talent." | regenerated, else blanked + flagged |
| nestled | "Nestled in a Geelong laneway, the venue seats eighty." | regenerated, else blanked + flagged |
| in-the-heart-of | "Live jazz in the heart of Melbourne." | regenerated, else blanked + flagged |
| delve | "Delve into three hours of improvised comedy." | regenerated, else blanked + flagged |
| tapestry | "A rich tapestry of sound and movement." | regenerated, else blanked + flagged |
| navigate-the-landscape | "We help you navigate the festival landscape." | regenerated, else blanked + flagged |
| plays-a-pivotal-role | "The venue plays a pivotal role in the night." | regenerated, else blanked + flagged |
| not-just-x-its-y | "This is not just a gig, it is a homecoming." | regenerated, else blanked + flagged |
| get-ready-to | "Get ready to dance until late." | regenerated, else blanked + flagged |
| whether-youre-x-or-y | "Whether you are a first-timer or a lifelong fan, the door opens at seven." | regenerated, else blanked + flagged |
| elevate | "Elevate your weekend with two headline sets." | regenerated, else blanked + flagged (generated copy only; legitimate in code) |
| unlock | "Unlock the full festival experience." | regenerated, else blanked + flagged (generated copy only) |
| vibrant | "A vibrant celebration of sound." | regenerated, else blanked + flagged (generated copy only) |
| seamless | "Seamless entry with your phone ticket." | regenerated, else blanked + flagged (generated copy only) |
| robust | "A robust lineup across two stages." | regenerated, else blanked + flagged (generated copy only) |
| leverage | "Leverage the early-bird price before Friday." | regenerated, else blanked + flagged (generated copy only) |
| em-or-en-dash | "Doors at seven — music at eight." | hard-stripped in place: "Doors at seven - music at eight." |
| exclamation-mark | "Tickets on sale now!" | hard-stripped in place: "Tickets on sale now." |
| banned-word-community-law | "A night of arts and culture in the west." | regeneration names it; repo grep fails any source recurrence |
| competitor-name | "Previously listed on Eventbrite." | regeneration names it; repo grep fails any public-copy recurrence |

- **C4** (commit `5ac64e4`): six voice registers in the Magic Start system
  prompt (music and nightlife, comedy, corporate, family, community and
  faith, festivals), each mandating the benefit-led opening, stated truths
  only, and the known production details; presence asserted by test.
- **C5** (commit `75aea92`): two-pass copy. Extraction pinned to Haiku 4.5;
  the prose pass on Sonnet 5 behind `AI_MAGIC_START_MODEL`; both under the
  monthly cost guard; failed copy pass degrades to extraction prose.
  **Measured latency delta** (drive-1, preview vs the pre-change build, same
  prompt, two runs each): single-pass 12.9s cold then 3.7s warm; two-pass
  9.9s then 9.2s warm. The Sonnet prose pass costs roughly 5.5 seconds on
  a warm path (3.7s to 9.2s). Raw numbers:
  `docs/design/phase-c-2026-07-25/drive-1-results.json`.

### C1 verification detail

The before evidence needed care: by capture time the staging alias had
moved to a build of this branch on which the related query returns empty
platform-wide, so staging showed no grid even before the removal. The
honest before comes from the older deployment the morning audit hit
(`eventlinqs-o33gby2gt`), which demonstrably renders the grid on the same
event: `c1-before-grid-1440.png` and `-390.png` (grid present), against
`c1-after-event-page-1440.png` and `-390.png` (this build: zero other
events, body-text scan confirms no "also like" and no "related" anywhere).
The `c1-before-event-page-*.png` pair records the staging anomaly for the
record.

## Part 4: the /launch composer, specified to build-ready (DO NOT BUILD YET)

### 4.1 Routes and files

- `src/app/launch/page.tsx`: the public composer (no auth anywhere on it).
  Shared chrome; light canvas; `robots: index` (it is a marketing surface);
  `.hero-marketing` hero from the licensed library.
- `src/app/launch/actions.ts`: server actions `saveKitDraft` (validate +
  upsert + set the signed cookie), `readKitDraft` (cookie to draft),
  `attachDraftToAccount` (post-signup migration).
- `src/components/launch/composer.tsx`, `kit-reveal.tsx`,
  `save-bar.tsx`: the three client pieces.
- Header CTA: in `site-header`, the primary gold CTA becomes "Create your
  event" -> `/launch` (founder ruling; one shared-chrome change, made once,
  verified on a hero and a no-hero route per the chrome law).
- Migration file (founder applies): `kit_drafts` table: `id uuid pk`,
  `token_hash text unique` (SHA-256 of the cookie token; the raw token
  never stored), `payload jsonb` (the draft fields), `created_at`,
  `expires_at` (72h), `claimed_by uuid null` (set at attach). RLS: service
  role only. A nightly sweep deletes expired unclaimed drafts.

### 4.2 The cookie contract (shipped ahead in C2)

`el_kit_draft`: 16 to 128 url-safe base64 characters, validated by
`isKitDraftToken` (`src/lib/growth/kit-draft.ts`), httpOnly, sameSite lax,
secure in production, 72h max age. Set ONLY after a kit has rendered for
the visitor (the reveal completing is the set moment). Its presence at
signup fires `email_captured_after_render`; `attachDraftToAccount` then
claims the draft row and clears the cookie.

### 4.3 The four states of one page

1. **The promise.** Hero: gold eyebrow "THE EVENT LAUNCH KIT", headline
   "Build your event. Watch your kit appear.", subline "Your page, your
   poster, your invitation cards and tracked share links, in under a
   minute. Free for free events." One Magic Start field ("Describe your
   event the way you would to a mate") + "or start from blank". No second
   CTA, no pricing tables. Hero content staggers per the Motion law; the
   raster never animates.
2. **The composer.** Two columns inside `max-w-7xl` (stacked at 390):
   left, six inputs (title, date and time with the +7day/2h defaults,
   venue name and suburb, cover upload with instant preview and the
   existing 4.5MB cap and client compression, free or paid toggle with one
   price field, category select); right, the live preview assembling as
   they type: the event card first, the page hero forming behind it.
   Magic Start (public, rate-limited per 4.6) fills the left and the
   preview animates the arrival. Draft persists to `kit_drafts` via
   `saveKitDraft` debounced at 800ms after the first title character
   (founder ruling: server-side, signed cookie).
3. **THE REVEAL** (the highest-leverage moment; all CSS, armed under
   `html[data-motion="1"]`, reduced motion gets the final state instantly):
   - 0ms: the composer collapses (200ms ease-out height fade).
   - +80ms: gold eyebrow "YOUR LAUNCH KIT" fades up; the live page card
     wipes up 16px, 240ms ease-out.
   - +260ms: the A4 poster slides in beside it; its QR block settles last
     (opacity + 1.02 scale, 200ms). The poster is the REAL renderer output
     for the draft; the QR resolves to the draft preview URL and carries
     the caption "goes live the moment you publish": never a dead scan.
   - +440ms: the invitation card (the real OG treatment at 1200x630)
     slides in third.
   - +620ms: the tracked share row pops beneath, 60ms stagger per channel.
   - +900ms: the save bar rises: "This kit is yours. Save it and publish
     free." + one email field + button "Save my kit". `kit_rendered`
     fires at +620ms (the kit is visible); the cookie is set here.
   - Every artefact is genuine output of the shipped renderers; a failed
     cover falls to the branded poster fallback exactly as production
     does. Zero mockups, zero fabrication.
4. **Save and publish.** Email submit -> existing signup + verify flow
   (magic-link preferred) -> `attachDraftToAccount` creates the
   organisation from one pre-filled "Who is running this?" field and the
   real event row (draft status) -> the organiser lands in the wizard
   review step with everything filled -> publish -> the EXISTING
   launch-kit screen with `?published=1`. No existing surface changes.

### 4.4 Copy laws on this surface

"In under a minute" is the only time claim. No competitor names or
numbers. No exclamation marks, no dashes, "community" only. Every
generated string passes the C3 gate before render.

### 4.5 Analytics

`kit_started` (first composer input, mode wizard | magic_start),
`kit_rendered` (reveal complete, `just_published: 0`),
`email_captured_after_render` (server, on signup with the cookie),
`event_published` (server, on the publish). The funnel reads end to end on
the four events shipped in C2.

### 4.6 Abuse posture

Magic Start on this surface: the existing AI cost guard plus a per-IP rate
limit (the `applyRateLimit` primitive, new bucket `launch-magic`, 5 per
hour per IP) and the existing input caps. Uploads: the existing size cap,
compression, and moderation pipeline. Drafts: never publicly listable,
token hashed at rest, 72h expiry, one draft per cookie. The composer
renders no user content to anyone but its own visitor.

### 4.7 Accessibility and performance

axe 0 serious/critical; the reveal is sequenced with `aria-live="polite"`
announcements per artefact; every control focus-ringed; touch targets
44px+. LCP is the hero raster (priority AVIF); the reveal assets lazy-load
during composing, so the reveal itself costs no fetch. Lighthouse 95+
desktop and mobile on the warmed preview before it ships.

### 4.8 Acceptance (Definition of Done for the eventual build)

An anonymous Playwright run types a description, watches the reveal reach
the save bar with a REAL poster PDF byte-for-byte identical to the shipped
renderer's output for the same input, captures 1440 + 390, submits an
email, completes signup, and lands on the real kit screen with
`?published=1` after publish; all four activation events assert-fired;
the copy gate passes on every string; zero dead links.

## Evidence index

See `docs/design/phase-c-2026-07-25/` (the capture list is recorded in the
delivery report and the visual comparison document).
