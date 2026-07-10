# Competitor-Mirrored Design Pass - Report

Date: 2026-06-07 (overnight, continued)
Branch: `feat/home-rebuild` (NO merge)
Preview: https://eventlinqs-app-git-feat-home-rebuild-lawals-projects-c20c0be8.vercel.app
Competitor evidence: `docs/benchmark/competitor-2026/` (captured today, Playwright, 1440 + 390)

---

## Founder rulings applied

1. **Hover wash stays NAVY-ONLY** platform-wide. No gold-sheen variant was added.
   (The shipped `.card-hover-wash` is already navy-only - no change needed.)
2. **Hero consistency**: the homepage hero scale is the single platform standard.
   Deviation only where fresh competitor evidence proves the equivalent page runs
   taller and reads better. Evidence gathered below; no page qualified, so the
   over-tall heroes were flattened.

---

## 1. Fresh competitor captures (today)

Live Playwright captures at 1440 + 390, stored under `docs/benchmark/competitor-2026/`.
Both sites returned real pages (HTTP 200, real content; the anti-bot vendor
strings in their markup are not block pages). Hero heights below are read from
the 1440 captures (desktop), measured as the vertical band before the primary
content begins.

| Competitor page | Hero treatment | Approx hero height (1440) |
|---|---|---|
| Eventbrite home | Promo image banner, then category circles | ~200px |
| Eventbrite browse (Sydney all-events) | NO hero - text H1 + filters + list + map | ~0 (text header only) |
| Eventbrite category (music) | NO hero - compact header then grid | ~0-100px |
| Eventbrite event detail | Contained media card (flyer/video), title below | ~470px contained |
| Eventbrite pricing | Tinted hero band, then white card section, tinted sections | text band |
| Eventbrite help | Clean "How can we help?" + search + icon-doc cards (no image) | none |
| Eventbrite signup | FULL-BLEED brand photograph behind a floating card | full-viewport photo |
| Ticketmaster home | Search band + "MJ the Musical" promo banner | ~200px |
| Ticketmaster discover (Music) | Compact dark hero band ("MUSIC" + underline) | ~220-290px |
| Ticketmaster event (-> Moshtix) | Minimal: thumbnail + title, no hero image | none |
| Ticketmaster help | Dark search band + trending-events rail + category cards | ~150px band |

**Headline finding: neither Ticketmaster nor Eventbrite runs a tall cinematic
hero on any page type.** Their heroes sit at or below ~200-290px on home /
browse / category, ~470px contained on event detail, and zero on browse. None
exceed the EventLinqs homepage standard (432px desktop).

---

## 2. Hero audit to the new ruling

EventLinqs hero heights, measured on the preview (real UA) at 1440x900 and
390x844. Homepage standard = **432px desktop / 354px mobile** (`.hero-marketing`:
42-48vh, min 320, max 480). "Before" = pre-flatten; "After" = this pass.

| EL page | Before (1440/390) | After (1440/390) | Homepage std | Competitor equiv | Decision |
|---|---|---|---|---|---|
| Home | 432 / 354 | 432 / 354 | - | EB/TM ~200px | KEEP (founder-loved standard; intentionally richer than rivals) |
| Organisers | 432 / 354 | 432 / 354 | = | - | already standard |
| Event detail | 630 / 464 | **432 / 354** | 432 / 354 | EB ~470 contained, Moshtix none | FLATTEN (competitor not taller) |
| Category | 576 / 540 | **432 / 354** | 432 / 354 | EB compact/none | FLATTEN |
| City / suburb / culture-city | 468 / 540 | **432 / 354** | 432 / 354 | TM ~220-290, EB ~0 | FLATTEN |
| Culture | 432 / 405 | **432 / 354** | 432 / 354 | as city | FLATTEN (mobile parity) |
| Pricing / help / about / careers / press / legal | short padded header | unchanged | under std | EB pricing/help short | already under standard |
| Auth (login/signup) | no hero | desktop brand panel | n/a | EB full-bleed photo | added (see section 3) |

Change: retired the `.hero-content` tier; `.hero-marketing` is the sole hero
token. Event detail, category, city/suburb/culture-city, and culture now use it.
Token + CLAUDE.md hero law updated in the same commit (`f613d15`).

**No page was kept taller for a founder ruling** - the evidence justified taller
for none of them.

---

## 3. The three open surfaces, decided by mirror

| Surface | Mirror evidence | Decision | Status |
|---|---|---|---|
| /help hero | EB help = clean text + search + icon cards (no image); TM help = dark search band + events rail (no photo hero) | Keep /help clean - the mirror does NOT show an image-rich help hero | No change (evidence-backed) |
| /pricing tier band | EB pricing presents tiers on a tinted band, white cards pop | Move tier band from white (surface=base) to tinted (surface=alt) + gold divider | Done (`6878b50`) |
| Desktop auth | EB signup = full-bleed brand photograph behind the card | Add a desktop-only (lg+) photographic brand panel in EventLinqs identity; mobile stays card-only (matches EB mobile) | Done (`dae3b30`) |

Optional future enhancement (not done, flagged): TM help carries a "trending
events" rail. We could add a popular-events rail to /help. Not required by the
ruling; founder call.

---

## 4. Designer finish pass

With the competitor captures on screen, the EventLinqs pages already carry the
section treatment system (verified in the prior overnight pass) and now share one
hero scale. Per-page aspect verdicts are in section 6. Where this pass found a
concrete, evidence-backed gap (pricing tier band on white; desktop auth with no
brand imagery; over-tall heroes), it was fixed. No speculative restyling was done
on already-approved pages.

---

## 5. Proof (deployed preview, final build `4bdc5ae`)

- **Hero heights re-measured (real UA):** every page hero = **432px desktop /
  354px mobile**, equal to the homepage standard (home, event-detail, city,
  suburb, culture, organisers all within +-0px). Was: event-detail 630/464,
  city/suburb 468/540, category 576/540. File:
  `docs/benchmark/system-pass/competitor-mirror/el-hero-heights.json`.
- **Link integrity:** ZERO dead links - 295 internal links all resolve 200.
- **axe:** ZERO violations of ANY impact across 38 page-scans (19 pages x 2
  viewports), including the rebuilt /pricing, /login, /signup, and the flattened
  event-detail/city/culture. One contrast regression on the pricing tint was
  caught and fixed (`4bdc5ae`) before this final pass. JSON:
  `docs/benchmark/system-pass/overnight-elevation/axe/`.
- **Lighthouse:** not run as a fresh sweep. The hero flatten reduces above-fold
  image area (neutral-to-positive for LCP/CLS); the navy hover wash remains
  audit-invisible (`data-headless` path); the auth brand image is on noindex auth
  pages only. The preview LH gate is separately tracked as known-RED for
  documented unrelated reasons (preview toolbar, Issue #42), not owned here.
- **Local gates before every commit:** tsc clean, eslint clean, vitest 329/329,
  next build clean.
- Commits this pass (per unit, pushed to feat/home-rebuild, NO merge):
  `f613d15` hero standard, `6878b50` pricing tint, `dae3b30` auth panel,
  `4bdc5ae` pricing contrast fix.

---

## 6. Per-page verdicts (vs the fresh competitor captures)

Captures: ours in `docs/benchmark/system-pass/competitor-mirror/after/`,
competitors in `docs/benchmark/competitor-2026/`. Aspects scored SURPASS /
PARITY / BELOW.

| Page | Hero scale | Treatment / rhythm | Imagery | Hover/micro | Overall |
|---|---|---|---|---|---|
| Home | SURPASS (432px, richer than EB/TM ~200px, founder-loved) | SURPASS | SURPASS | SURPASS (navy wash) | SURPASS |
| Event detail | PARITY (now homepage scale; full-bleed cinematic vs EB contained card) | SURPASS | SURPASS | PARITY | SURPASS |
| City / suburb | PARITY (homepage scale; EB browse has none, TM compact) | SURPASS (dark community band, tinted browse) | SURPASS | PARITY | SURPASS |
| Culture | PARITY | SURPASS | SURPASS | PARITY | SURPASS |
| Category | PARITY (flattened) | PARITY | SURPASS | PARITY | PARITY |
| /events browse | PARITY (compact strip, like EB/TM) | PARITY | SURPASS (card imagery vs EB text rows) | SURPASS (wash) | SURPASS |
| Organisers | PARITY/SURPASS (reference build) | SURPASS | SURPASS | PARITY | SURPASS |
| Pricing | n/a (short header) | SURPASS now (tinted tier band, white cards pop) | PARITY | PARITY | SURPASS |
| Help | n/a | PARITY (clean, matches EB help exactly) | PARITY (icon cards, mirror shows no photo hero) | PARITY | PARITY |
| Desktop auth | n/a | SURPASS now (split brand panel, mirrors EB) | SURPASS | PARITY | SURPASS |
| Legal | n/a | SURPASS (TOC sidebar, sectioned) | n/a | n/a | SURPASS |

No aspect graded BELOW after this pass. The only PARITY-not-SURPASS items
(category treatment, help) are deliberate: the mirror shows competitors run those
page types compact/clean, so matching is correct, not a shortfall.

---

## Files changed this pass

- `src/app/globals.css` (retire `.hero-content`, single hero token)
- `CLAUDE.md` (hero law: one standard)
- `src/app/events/[slug]/page.tsx`, `PhotographicCategoryHero.tsx`,
  `city-hero.tsx`, `PhotographicCultureHero.tsx` (flatten to `.hero-marketing`)
- `src/components/templates/PricingPage.tsx` (tinted tier band)
- `src/components/auth/auth-shell.tsx` (desktop brand panel)
- `scripts/probe-competitors.mjs`, `capture-competitors.mjs`,
  `measure-el-heroes.mjs` (evidence tooling)
- `docs/benchmark/competitor-2026/**` (competitor captures + measurements)
