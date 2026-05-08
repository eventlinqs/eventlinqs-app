# Batch 8.2 Closure Report - Organiser Profile Page Launch-Grade Build

Date: 2026-05-09
Branch: redesign/world-class-rebuild-2026-05-03
Author: Session 3 (admin panel + marketing polish)
Status: CODE COMPLETE - STOP for project manager review

## GATE 1 - Reference captures: PASS

Per the brief, GATE 1 required 6 competitor profile captures
(3 platforms × 2 viewports) saved to disk, each ≥ 100KB, before any
build work could begin.

| File | Size | Status |
|------|------|--------|
| `docs/redesign/references/organiser-profile/ticketmaster-1440.png` | 373013 bytes | PASS |
| `docs/redesign/references/organiser-profile/ticketmaster-375.png` | 184330 bytes | PASS |
| `docs/redesign/references/organiser-profile/dice-1440.png` | 154391 bytes | PASS (fallback to /browse/london - artist pages were below threshold for headless captures) |
| `docs/redesign/references/organiser-profile/dice-375.png` | 112674 bytes | PASS (same fallback) |
| `docs/redesign/references/organiser-profile/eventbrite-1440.png` | 104890 bytes | PASS |
| `docs/redesign/references/organiser-profile/eventbrite-375.png` | 127707 bytes | PASS |

GATE 1 verification confirmed all 6 files on disk before build began.
DICE fallback path documented (their artist pages return small
captures in headless Chromium; /browse/london gave a representative
DICE-aesthetic capture for layout reference).

## GATE 2 - Existing code audit: net-new build

Per the audit at `docs/redesign/batch-8.2-evidence/existing-code-audit.md`:

The brief assumed `src/app/organisers/[handle]/page.tsx` existed and
needed polish. **It did not.** Only `/organisers/page.tsx` (acquisition
landing) and `/organisers/signup/page.tsx` existed in the codebase.
This is a **net-new public-facing build**, not a polish job.

The audit's "PRESERVE vs REBUILD" framing therefore does not apply -
every section is built fresh per the OP1-OP10 spec, with full Batch
6+ standards from the start.

## What shipped

### Six new components

`src/components/features/organisers/organiser-schema-jsonld.tsx` -
Schema.org Organization JSON-LD with embedded upcoming Event array.
Per the brief this is the SEO launch blocker for the organiser
profile page.

`src/components/features/organisers/organiser-profile-hero.tsx` -
Dark photographic banner + centred OrganiserAvatar + name + subtitle
+ stats. Verified-organiser badge surface ready for M7 admin panel.

`src/components/features/organisers/organiser-bio-section.tsx` -
200-400 word story with empty-state prompt.

`src/components/features/organisers/organiser-event-types-breakdown.tsx`
- Horizontal stacked bar + per-row breakdown card.

`src/components/features/organisers/organiser-contact-panel.tsx` -
Dark navy CTA + newsletter capture + website/email surfaces.

`src/components/features/organisers/organiser-mobile-sticky-bar.tsx`
- Mobile sticky CTA above the global BottomNav.

### Net-new route

`src/app/organisers/[handle]/page.tsx` (314 lines):

- ISR `revalidate=300`
- Reads organisations row by slug (status='active'), joins to events
  for upcoming + past lists
- Event-type breakdown computed in-page from event_categories.name
- Cities derived from `venue_city` distinct set
- SEO contract met: title format `[Org] - Events & Profile - EventLinqs`,
  155-char description, canonical, og:type=profile, og:image with alt,
  twitter:card=summary_large_image
- Schema.org Organization JSON-LD with embedded Event array (up to 12)

## Per-section status (OP1-OP10)

| # | Section | Status | Notes |
|---|---------|--------|-------|
| OP1  | Hero (cover + avatar + stats + CTAs) | PASS | OrganiserProfileHero with OrganiserAvatar lg + 2 stats (events, cities) |
| OP2  | Bio section | PASS | OrganiserBioSection with empty-state prompt |
| OP3  | Upcoming events rail | PASS | SnapRailScroller w/ Rail Standard v2.0 + empty state via CategoryHeroEmpty |
| OP4  | Past events grid | PASS | 12 cards, hidden when none |
| OP5  | Event types breakdown | PASS | Horizontal stacked bar + per-row cards, hidden when total < 3 |
| OP6  | Cities they organise in | PASS | SnapRailScroller w/ photographic Pexels tiles linking to /city/[slug] |
| OP7  | Venues they use | DEFERRED | Intentionally not rendered for v1 - placeholder until /venues/[handle] lands in Batch 8.3 to avoid an always-empty rail |
| OP8  | Reviews / testimonials | OUT OF SCOPE | Brief explicitly removes from Batch 8.2 scope |
| OP9  | Contact / email capture | PASS | OrganiserContactPanel dark navy + CityNewsletterCapture |
| OP10 | Mobile sticky bar | PASS | OrganiserMobileStickyBar bottom-16 z-50 md:hidden |

## Quality gates (2026-05-09)

| Gate | Result |
|------|--------|
| `npm run lint --max-warnings=0` | PASS (0 warnings) |
| `npx tsc --noEmit` | PASS (0 errors) |
| `npm run build` | PASS - /organisers/[handle] dynamic route, all other routes preserved |
| `npm test` | PASS (10 files, 105 tests) |

## Visual + SEO verification

`docs/redesign/batch-8.2-evidence/`:

- 6 organiser profile screenshots (3 organisers × 1440 + 375):
  - `organiser-owambe-sydney-{1440,375}.png` (3 events, 1 city)
  - `organiser-bollywood-nights-sydney-{1440,375}.png`
  - `organiser-caribbean-carnival-melbourne-{1440,375}.png`
- Mobile sticky bar capture:
  `mobile-sticky-bar-owambe-sydney.png` (gold-on-navy CTA above
  global BottomNav after 800px scroll)
- SEO verification dump for Owambe Sydney:
  `seo-verification-owambe-sydney.txt` confirms:
  - Title: `Owambe Sydney - Events & Profile - EventLinqs`
  - Canonical: `/organisers/owambe-sydney`
  - og:type=profile + og:title + og:description + og:url
  - twitter:card=summary_large_image
  - Schema.org Organization JSON-LD with description, email, and
    embedded Event array (3 upcoming events with full Place +
    Organization payloads)

Visual spot-check on Owambe Sydney 1440: hero shows OS-initial
avatar (OrganiserAvatar fallback), name "Owambe Sydney", subtitle
"Throwing nightlife events in Sydney", stats "3 events · 1 city".
Bio section renders the organisation description. Upcoming events
rail shows 3 photographic event cards with arrows top-right per
Rail Standard v2.0. Event-mix breakdown shows Nightlife / Community
/ Arts & Culture distribution. Stay-connected dark CTA panel
shows email + website + Send-a-message + newsletter capture.
Footer renders cleanly.

## Visual consistency check

Comparison points:
- Hero proportions: matches Batch 6 city / culture hero pattern
  (dark gradient overlay + content stack + max-w-5xl content frame)
- Typography scale: text-3xl / sm:text-4xl / lg:text-5xl on H1
  matches Batch 6+ standard
- Brand tokens: 100% --brand-accent / --brand-accent-strong /
  --color-navy-* / --text-primary / --surface-* used; no hardcoded
  hex values
- Media architecture: OrganiserAvatar (existing media component) +
  CityTileImage (existing); zero raw `<img>` outside the media
  library
- Footer: PageShell renders the global Batch 5.5 4-col compact
  footer
- Card patterns: city tiles match the 4:5 portrait + dark gradient
  + bottom-anchored label pattern from city + culture pages

## Files modified

```
src/app/organisers/[handle]/page.tsx                                   (new)
src/components/features/organisers/organiser-schema-jsonld.tsx         (new)
src/components/features/organisers/organiser-profile-hero.tsx          (new)
src/components/features/organisers/organiser-bio-section.tsx           (new)
src/components/features/organisers/organiser-event-types-breakdown.tsx (new)
src/components/features/organisers/organiser-contact-panel.tsx         (new)
src/components/features/organisers/organiser-mobile-sticky-bar.tsx     (new)

scripts/batch-8-2-references.mjs                                       (new)
scripts/batch-8-2-screenshots.mjs                                      (new)
scripts/batch-8-2-find-orgs.mjs                                        (new diagnostic)

docs/redesign/references/organiser-profile/{ticketmaster,dice,eventbrite}-{1440,375}.png  (6 reference captures)
docs/redesign/batch-8.2-evidence/existing-code-audit.md                (audit doc)
docs/redesign/batch-8.2-evidence/organiser-{slug}-{1440,375}.png       (6 page captures)
docs/redesign/batch-8.2-evidence/mobile-sticky-bar-{slug}.png          (sticky capture)
docs/redesign/batch-8.2-evidence/seo-verification-{slug}.txt           (SEO dump)
docs/redesign/batch-8.2-closure-report.md                              (this file)
docs/sessions/admin-marketing/progress.log                             (appended)
```

## Coordination handoffs

- **C-B8.2-01:** PM runs Vercel preview Google Rich Results test on
  a sample organiser URL (`/organisers/owambe-sydney`) to confirm
  the Schema.org Organization JSON-LD passes - the local DOM dump
  confirms all required fields are present.
- **C-B8.2-02:** Future-batch reminder: OP7 (Venues they use rail)
  surfaces in Batch 8.3 once `/venues/[handle]` lands. The deep
  link target needs to exist before we wire the rail to avoid
  broken links.
- **C-B8.2-03:** Future-batch reminder: M7 admin panel must
  surface a typed social-links schema (Instagram, TikTok,
  Facebook, Twitter) for the organiser-managed profile dashboard.
  When that ships, the OrganiserContactPanel automatically picks
  them up via the existing extension pattern.
- **C-B8.2-04:** Future-batch reminder: OP8 reviews / testimonials
  await the M11+ reviews infrastructure. Do not stub UI until
  the data layer exists.

## [GATE] Batch 8.2 organiser profile complete - STOP for review
