# The dead-end crawl: every link and every button, at 390 and 1440

16 August 2026. Run against the `integration/launch` preview at `9c4408f` and,
read-only, against production. The script is `scripts/dead-end-crawl.mjs`.

## The result, first

**Zero broken links. Zero inert buttons. Zero missing anchors. Zero no-op
anchors.** On both surfaces, at both viewports.

| Pass | Requested | **MEASURED `window.innerWidth`** | Pages loaded | Anchors inspected | Buttons inspected | Unique internal targets requested | BLOCKER | MAJOR |
|---|---|---|---|---|---|---|---|---|
| Preview `9c4408f`, mobile | 390 | **390** | 30 / 30 | 2034 | 585 | 360 / 360 | 0 | 0 |
| Preview `9c4408f`, desktop | 1440 | **1440** | 30 / 30 | 1916 | 443 | 361 / 361 | 0 | 0 |
| Production, mobile | 390 | **390** | 30 / 30 | 1837 | 399 | 253 / 253 | 0 | 0 |
| Production, desktop | 1440 | **1440** | 30 / 30 | 1713 | 259 | 250 / 250 | 0 | 0 |

The 30 pages are 24 fixed public surfaces plus **six real event detail pages
discovered from `/events` at run time**, because the defect that produced this
script was on an event page and a crawl of the marketing set could never have
seen it.

## Why a clean report here is not a vacuous one

This project has been bitten five times by a reporter that printed PASS while
doing no work, so the detectors were calibrated against known positives rather
than trusted.

| Detector | Proof it can fire |
|---|---|
| Seed page not 200 | The first run carried `/blog` and `/categories/music` in the seed list. Both returned 404 and both were reported as BLOCKER. They were **my seed-list errors, not platform defects**: there is no `/blog` route in the tree, and `/categories/[slug]` serves seven legacy slugs only. Both were corrected, and the run above proves the class fires |
| No-op anchor | Measured directly on production event pages: the gold "Get tickets" moves the page **2612 to 2768px at 390px** and **693px at 1440px**. Real numbers from the live DOM, not an inference |
| Inert button | An inert button and a wired button were injected into a live `/pricing` page and put through the same classifier. It returned `INERT` and `live` respectively. On that page it also classified 14 of 19 real buttons live, the other 5 excluded by a stated rule |
| Broken link | Every unique internal target is requested and its status compared. 360 and 361 targets, all 200 |

## The five classes, and what each answers

1. **BROKEN LINK** - an internal href whose final response is not 200.
2. **EMPTY LINK** - `href="#"`, `href=""`, `javascript:void(0)`, or no href at all.
3. **MISSING ANCHOR** - `href="#id"` where no element carries that id.
4. **NO-OP ANCHOR** - `href="#id"` where the page would move less than 120px.
5. **INERT BUTTON** - an enabled `<button>` with no click handler, not a submit,
   not a popover trigger, not wrapped in a link.

**Class 4 is the founder's own find, and it is the reason the viewport is an
argument rather than a default.** The same markup can be a working scroll at
390px and a no-op at 1440px, so a single-viewport crawl is structurally unable to
see it.

**Class 5 is decided without clicking.** Clicking every button on a live
deployment is not a test, it is a series of side effects, and one dialog would
have ended the session. React attaches the element's props to the DOM node under
a `__reactProps$<hash>` key, so an `onClick` is read off the node instead.

## A correction to my own first run

The first version of class 4 flagged an anchor whose target was **fully inside
the viewport**. It reported two findings, "About These Terms" on `/legal/terms`
and "About This Policy" on `/legal/privacy`, both at 1440.

**Both were false positives**, and they were withdrawn when the rule was replaced
with the measured scroll distance: those targets are more than 120px down the
page, so pressing the link does move it. A tall target whose bottom happens to
fit in the viewport is not a no-op. The measurement is the right rule and the
inference was the wrong one.

## The one real finding, which is a ruling rather than a fix

**On desktop the event page's gold "Get tickets" points at a panel that is
already on screen.**

Measured on production, three events, viewport 1440 x 900:

| Event | Delta at 390px | Delta at 1440px |
|---|---|---|
| `/events/reggae-on-the-lawn-family-carnival-day` | 2612px | **693px** |
| `/events/amapiano-day-party-adelaide-hills` | 2612px | **693px** |
| `/events/diwali-mela-brisbane-2026` | 2768px | **693px** |

693px into a 900px viewport means the ticket panel is **already visible before
the CTA is pressed**. It is not broken: the page does move, and the crawl
correctly does not flag it at 120px. But on a taller desktop window the panel is
more fully in view, and pressing a primary call to action that takes you to
something you can already see and use is exactly what the founder described.

On a phone the same control does 2612px of real work, and it is the most
important control on the page there. So the answer is not to remove it.

**Three options, all of them design decisions on a working surface, none taken
tonight:**

1. Hide the hero CTA at `lg` and above, where the panel is in the same viewport.
2. Keep it and make it FOCUS the ticket panel rather than scroll to it, so it
   does something visible even when the target is already on screen.
3. Leave it, on the grounds that a hero CTA is a competitor-standard convention
   and redundancy on desktop is cheap.

Founder ruling needed. `src/app/events/[slug]/page.tsx:786` is the anchor and
`:1035` is the target.

## What was NOT covered, stated so it is not mistaken for coverage

- **Authenticated surfaces.** The dashboard, the organiser wizard, checkout past
  the first step, the admin panel and the scanner are all behind a login and
  none of them was crawled. The `surface-proof` skill carries the saved-session
  flow that would let them be.
- **Buttons that work through a delegated parent handler** would be reported as
  inert. None was reported, so the question did not arise, but the limitation is
  real and is why every class-5 finding must be confirmed by hand before it is
  called a defect.
- **`/blog` does not exist.** `docs/roast/POST-LAUNCH-FINDINGS.md` names it in
  the Lighthouse URL-set gap (MAJOR-4). Nothing on any crawled page links to it,
  so it is not a dead link; the finding that mentions it is stale.
- **`community-picks-section.tsx`** links every tile to `/categories/<slug>` for
  slugs that route serves. It is currently rendered nowhere, so none of those
  links exists on any page. It would be 18 dead links the day it is wired up.

## Running it again

```
node scripts/dead-end-crawl.mjs https://<base> --json report.json
node scripts/dead-end-crawl.mjs https://<base> --viewport 390
```

It exits 1 on any BLOCKER, and also exits 1 if a viewport loaded zero pages,
because a crawl that loaded nothing is not a pass.
