---
name: competitor-benchmark
description: Use whenever a design or page-build task needs to know what the competitors (Ticketmaster, Eventbrite) actually look like - hero heights, page treatments, rail patterns, auth/help/pricing layouts - so you NEVER re-ask the founder "what do competitors look like". Read this before designing any page type; only re-capture when evidence is stale (>90 days) or a new page type is being designed.
---

> **Definition of Done (binding):** This task inherits the CLAUDE.md "Definition of Done (SHIP 100%, A to Z)" section. Nothing ships partial; zero placeholders, stubs, or dead links; everything works on real data; a QA pass confirms zero placeholders and full function; pass the competitor benchmark gate (Ticketmaster lead, Eventbrite, DICE) at desktop 1440 and mobile 390; if you cannot reach 100 percent, report the exact remaining items as NOT DONE and never imply completeness.

# competitor-benchmark

## The rule (founder order)

No EventLinqs design session re-asks the founder what competitors look like. The
competitor DNA is encoded here, distilled from VERIFIED live captures. Read this
skill, apply the facts, and design against them. Re-capture ONLY when:

- the evidence is stale (captures older than 90 days), or
- you are designing a page type not covered below.

Reference competitors: **Ticketmaster AU** and **Eventbrite AU** (the two the
founder benchmarks against). Airbnb is the rail-interaction gold standard (see
the separate rail-controls evidence).

## Evidence pointer (single source of truth)

- Capture index + verdicts: `docs/benchmark/competitor-2026/INDEX.md`
- Measured numbers (hero heights, banner kinds, h1 positions):
  `docs/benchmark/competitor-2026/measurements.json`
- Rail-control evidence (Airbnb/TM/EB/Humanitix): `docs/benchmark/rail-controls/CATALOGUE.md`
- Captured / audited 2026-06-08. **Stale after 2026-09-06.**
- 26 captures, all VERIFIED (TM + EB, desktop 1440 + mobile 390, fold, clamped
  to <= 1800px longest side). PNGs are gitignored; INDEX + measurements are the
  committed record.

## Hard reference facts - hero / header treatment per page type

Heights are the measured band before primary content (desktop 1440 unless noted).
None of the competitors runs a tall cinematic hero anywhere - this is the central
finding and the licence for the EventLinqs single-hero standard below.

| Page type | Ticketmaster | Eventbrite |
|---|---|---|
| Home | search band + promo banner, **~200px** | promo image banner, **~480px** then category circles |
| Browse / all-events | (n/a) | **NO hero** - text H1 + filters + list + map (~0) |
| Category | compact dark band, **~250-290px** ("MUSIC" + underline) | **NO hero** desktop - compact header then grid; mobile shows a small banner |
| Event detail | minimal (TM hands off to Moshtix): thumbnail + title, no hero image | **contained media card** (flyer/video ~470-560px contained), title below |
| Pricing | (n/a) | **tinted bands** - tiers on a tinted band, white cards pop |
| Help | **dark search band + trending-events rail + category cards** (~150px band) | clean "How can we help?" + search + icon-doc cards, **no image hero** |
| Sign in / auth | **split-panel modal**: dark navy "WELCOME" left panel (brand copy + logo) + white "Sign in or create account" form right (email + Continue + passkey) | signup **modal over a full-bleed brand photograph** (desktop); **mobile card-only**, no photo |
| Organiser landing | (n/a) | full hero ("WHERE EVENT ORGANIZERS GROW") + crowd photo + Features/Pricing nav + "Get started for free" / "Contact Sales" CTAs |

Reading: both run heroes at or below ~200-290px on home/category, ~470-560px
contained on event detail, and zero on browse. Auth is the one place BOTH lean
on a brand panel/photograph on desktop and go card-only on mobile - which is
exactly the EventLinqs desktop-auth decision.

## Hard reference facts - rail / card variation patterns

Competitors and the EventLinqs system both vary rails by ROLE (cards uniform
WITHIN a rail, differentiated BETWEEN rails). Patterns in evidence:

- **Per-rail card scale**: standard landscape cards for most rails; a larger
  feature-card row for a highlighted rail; compact square tiles for dense
  category/scene rails.
- **Square tiles** for category/scene/genre browse (dense, geometric).
- **Ranked / numbered rails** (chart style): a large numeral beside each card -
  numeral sits BESIDE the image, never on it.
- **Editorial / wide feature rows** for hand-picked sets.
- **Rail controls** (Airbnb gold standard, now EventLinqs law): paired circular
  arrows top-right of the rail header, opaque solid fill, >= 44px, muted disabled
  state at either end, NO progress dot. Full law in the `page-build` skill (Rail
  Control System) and `docs/benchmark/rail-controls/CATALOGUE.md`.

## Hard reference facts - hover / interaction language

- Competitors use restrained card hover (lift + shadow + slight image scale).
- EventLinqs goes further with the **navy hover breathing wash** (brand-navy
  gradient over the image, motion-gated) on top of lift + image scale + gold
  focus ring. One shared impl (`HoverWash`); full spec in CLAUDE.md Motion.
- No auto-rolling carousels anywhere (competitors and us). Manual only.

## EventLinqs laws that BEAT them (evidence-derived, do not regress)

- **Single hero standard**: `.hero-marketing` = 432px desktop / 354px mobile, on
  EVERY page. The evidence shows no competitor runs a taller hero on any page
  type, so EventLinqs' richer-but-consistent hero already surpasses them. A
  taller hero on any page needs FRESH competitor evidence proving that page type
  runs taller - none qualified in this capture set.
- **Navy hover wash**, navy-only (no gold-sheen variant).
- **Navy/gold SOLID surfaces**: opaque headers, filter bars, badges, controls.
  No glassmorphism / backdrop-blur anywhere. No flat painted dark slabs (darkness
  only from a photograph + navy overlay).
- **No bento grids.** Banned.
- **Evidence before deviation**: every hero/treatment/rail decision traces to a
  verified capture here, never to taste. If the evidence does not support it,
  do not ship it.

## The premium bar (every page, not just the homepage)

EventLinqs must present as a premium production worth more than US$200K. Judge
EVERY public page against this, the same as the homepage:

- **Rich imagery on every public page** - real photography through the media
  library, never bare text where a competitor shows imagery.
- **Treated surfaces, never bare white bands** - the `ContentSection` treatment
  system (surface base/alt/dark + gold top-divider + reveal) on every section.
- **Breathing hovers** - the navy hover wash + lift on every card/tile.
- **Competitor-evidence design decisions** - no layout invented from assumption;
  it maps to a verified capture here.
- **Zero dead links, zero broken states** - every rendered link resolves 200
  (link-integrity crawl); no broken images, no empty rails rendered as headers,
  branded placeholders for missing media.

A page that is bare, generic, white-banded, image-poor, or has a dead link or
broken state has FAILED the bar, regardless of how the homepage looks.

## Re-capture procedure (stale >90 days, or a new page type)

1. Most surfaces: capture at 1440 + 390, real UA, accept cookies, fold capture
   (`scripts/capture-competitors.mjs` / the mirror capture script).
2. Auth/account pages: `scripts/capture-competitor-missing.mjs` - NEVER guess an
   auth URL; navigate from the homepage account / "Sign In/Register" control and
   wait for the real form to render (the OAuth page is an SPA that shows a spinner
   first - wait for `input[type=email]` / "sign in or create account").
3. Clamp every capture to <= 1800px on the longest side (sharp).
4. Re-audit visually, update `INDEX.md` (filename / dimensions / page /
   VERIFIED-INVALID) and `measurements.json`, bump the stale date, and update the
   hard facts above if anything material changed.
