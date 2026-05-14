# Batch 11.0 - Spacing inconsistencies discovered

Date: 2026-05-14
Purpose: data-gathering for Batch 11.1 Part 2 spacing audit. No
fixes applied in this batch.

Captures referenced: `docs/redesign/batch-11-evidence/header-verify/*.png`
(94 captures, 47 routes × 2 viewports). Each capture shows the top
200px in initial state and top 160px after scroll=1000.

## Observed inconsistencies

### 1. Gap between hero band and first content rail

- `/culture/african`, `/culture/south-asian`, `/culture/caribbean`,
  `/culture/latin`, `/culture/pacific`: hero band drops directly
  into the editorial / sub-cultures intro with `py-12 sm:py-16`
  spacing on the first section.
- `/city/sydney`, `/city/melbourne`, `/city/brisbane`, `/city/perth`,
  `/city/adelaide`: hero band drops into the date-filter chip strip,
  then editorial section with `py-10 sm:py-12` - tighter than the
  culture pages.
- `/culture/african/sydney` and other intersections: tighter again at
  `py-8 sm:py-10`.
- Homepage: hero carousel into the category chip strip with `py-6`
  on the chip strip then the first event rail at `py-12 sm:py-16`.

  *Recommendation for 11.1:* Standardise the hero → first-rail gap
  across all hero-bearing routes to `py-12 sm:py-16 lg:py-20`. The
  intersection page tightening seems unintentional.

### 2. Gap between rails

- Homepage: `SECTION_DEFAULT` from `@/lib/ui/spacing` provides
  `py-12 sm:py-16 lg:py-20`. Applied consistently across all
  Suspense-wrapped rails.
- Culture pages: rails use `mt-8 sm:mt-12 lg:mt-16` between rail
  groupings - tighter top spacing without bottom padding mirror.
- City pages: mixed - some rails use `py-10 sm:py-14`, others
  `py-12 sm:py-16`.
- Intersection pages: rails use `mt-12` only.

  *Recommendation for 11.1:* Adopt `SECTION_DEFAULT` everywhere or
  define a `SECTION_TIGHT` (py-10 sm:py-12) and `SECTION_RELAXED`
  (py-12 sm:py-16 lg:py-20) and apply per surface intent. Currently
  the gap variance is visible side-by-side and feels accidental.

### 3. Gap from last rail to footer

- Homepage: `EmailSignupPanel` provides natural breathing room before
  the footer.
- Culture pages: ends with the related-cultures rail, then the footer
  - last rail ends `pb-16`, footer starts `pt-12`. Combined 112px
  gap reads correctly.
- City pages: ends with `CityOrganiserCtaPanel` then `MobileStickyBar`
  - the panel has `mb-0` and the footer has `pt-12`, so on a
  populated event page the footer sits tight against the panel. On
  empty event pages the gap is too tight (~48px combined).
- Legal pages: tight - body text ends and footer begins with
  ~48-64px gap. Reads as cramped on desktop.

  *Recommendation for 11.1:* Pre-footer spacer band of 64-96px on
  all marketing-style pages (legal, about, contact, help). Inline
  CTA panels (events grid, organiser panel) can keep tighter gaps
  intentionally.

### 4. Mobile horizontal padding

- Homepage + most public pages: `px-4 sm:px-6 lg:px-8` consistently
  applied via the `CONTAINER` helper.
- Event detail page (`/events/[slug]`): hero band uses `px-5` on
  mobile (one tier wider). Other sections drop to `px-4`. The hero
  contrasts visually.
- Checkout (`/checkout/[reservation_id]`): wraps in `px-4` only,
  no `sm:` breakpoint shift. Trust signal aside sits at `px-4` too.
- Legal pages: `px-4 sm:px-6 lg:px-8` consistent.

  *Recommendation for 11.1:* Normalise to `px-4 sm:px-6 lg:px-8`
  via `CONTAINER` everywhere. The event-detail hero `px-5` was a
  deliberate Batch 8.1 choice (tighter band lines) but creates a
  shoulder against subsequent sections.

### 5. Card and rail item spacing

- `SnapRailScroller` gaps: rails use `gap-3 sm:gap-4` for tight
  rails and `gap-4 sm:gap-6` for relaxed rails. Inconsistent across
  feature surfaces (CityRailSection uses tight, CityEditorialSection
  uses relaxed).
- BentoGrid layouts: trending events bento uses `gap-3 sm:gap-4`,
  cultural moments bento uses `gap-4 sm:gap-6`.

  *Recommendation for 11.1:* Define `GRID_GAP_TIGHT` and
  `GRID_GAP_RELAXED` constants in `@/lib/ui/spacing` and reference
  them everywhere instead of inline `gap-N`.

### 6. Header / content separation

(Now resolved by Batch 11.0 header fix.) Previously the header
sticky element pushed content down by 80px on every page because
the `HeaderScrollSentinel` lived in document flow. Fixed in this
batch by switching the sentinel to `position: absolute` so it does
not consume layout space. Content now starts immediately under the
header on every page.

## Severity rating

All items above are **Medium-Low** - visible inconsistency but not
launch-blocking. The post-launch user experience reads as polished
on every page; the inconsistencies become noticeable when comparing
two pages side-by-side, which is what an audit pass surfaces.

Suggested 11.1 Part 2 spacing audit sequencing:

1. Stand up a `SPACING` constants module (`@/lib/ui/spacing-v2`) with
   `SECTION_TIGHT`, `SECTION_RELAXED`, `RAIL_GAP_TIGHT`,
   `RAIL_GAP_RELAXED`, `PRE_FOOTER` named values.
2. Codemod replace inline `py-N` / `gap-N` / `mt-N` patterns to
   reference the new constants.
3. Capture before/after Playwright at 7 viewports per page family.
4. Founder visual sign-off per family before merge.

End of report.
