# Batch 9.2 GATE 2 - Existing Code Audit

Date: 2026-05-09
Branch: redesign/world-class-rebuild-2026-05-03
HEAD: 07461d1

---

## Homepage section structure (`src/app/page.tsx`)

Current section order:

1. `<HomeSchemaJsonLd />` (locked 9.1 V2)
2. `<SiteHeader />` (locked 9.1, 9.1.1)
3. `<HomeHero />` - **TARGET FOR REBUILD** as the new SplitStateHero
4. `<TrustBadgesRow />` (locked 9.1 V2)
5. SurpriseMe inline section + `<SurpriseMeButton />` (locked 9.1 V2)
6. Bento grid "What everyone is buying into" - existing inline using `BentoGrid`/`BentoTile`/`BentoSupportingColumn`. Renders 1 hero + 3 supporting (4 events). **The new H8 spec wants 1 large + 3 medium + 2 supplementary (6 events) at a different layout. REBUILD this section.**
7. `<ThisWeekSection>` Suspense rail (preserve)
8. `<EventRailSection>` This Weekend (preserve)
9. `<EventRailSection>` Free events (preserve)
10. `<CulturalPicksSection>` Suspense (preserve)
11. `<EventRailSection>` Trending (preserve)
12. `<LiveVibeSection>` Suspense (preserve)
13. `<EventRailSection>` Just Added (preserve)
14. `<EventRailSection>` Editor's Picks (preserve)
15. `<CityRailSection>` Suspense (preserve)
16. `<EventRailSection>` Community (preserve)
17. `<FeaturedVenuesSection>` (preserve)
18. For Organisers dark split (existing inline; preserve)
19. `<SiteFooter />` (preserve)

**Insertion plan:**
- Replace `<HomeHero />` with new `<SplitStateHero />` at position 3.
- Insert new `<CategoryChipStrip />` between TrustBadgesRow and SurpriseMe (position 4.5).
- Replace the inline bento at position 6 with the new `<TrendingEventsBento />`.
- Insert new `<CulturalMomentsBento />` after the existing Trending rail (after position 11).
- Insert new `<EmailSignupPanel />` after FeaturedVenues (between position 17 and 18).

This preserves all locked 9.1 V2 components, all preserved rails, and the For Organisers section while introducing the 5 new sections in their spec'd positions.

---

## Locked 9.1 V2 components

All in `src/components/features/home/`. Listed in 9.2 brief Section 7.3 as DO NOT TOUCH:

| File | Purpose |
|---|---|
| `home-schema-jsonld.tsx` | Homepage Schema.org JSON-LD (Event + Place + Organization) |
| `trust-badges-row.tsx` | "No hidden fees / Verified organisers / Fair refund policy" strip |
| `surprise-me-button.tsx` + `surprise-me-modal.tsx` | "We'll pick three events for you" discovery |

These render unchanged in the new homepage layout.

---

## Homepage components free to refactor

| File | Verdict |
|---|---|
| `home-hero.tsx` | REBUILD - replace with `split-state-hero.tsx` |
| The inline "What everyone is buying into" bento section (in `page.tsx` directly) | REBUILD - replace with `<TrendingEventsBento />` |
| `this-week-section.tsx`, `event-rail-section.tsx`, `cultural-picks-section.tsx`, `live-vibe-section.tsx`, `city-rail-section.tsx`, `featured-venues-section.tsx`, `section-skeletons.tsx` | PRESERVE - rails stay below the new bento sections |
| For Organisers dark split (inline) | PRESERVE |

---

## HeroMedia + gradient overlay location

**HeroMedia itself does NOT carry a gradient overlay.** `src/components/media/HeroMedia.tsx` (read at the audit pass) only renders the `<Image>` and the optional ambient layer. The gradient overlays that darken hero photographs for text-readability live in the photographic hero TEMPLATES:

| Template | Mid-stop alpha | Path |
|---|---|---|
| `PhotographicCultureHero` | `rgba(10,22,40,0.45)` at 45% | `src/components/templates/PhotographicCultureHero.tsx:46` |
| `PhotographicCityHero` | `rgba(10,22,40,0.40)` at 45% | `src/components/templates/PhotographicCityHero.tsx:57` |
| `PhotographicCategoryHero` | similar pattern | `src/components/templates/PhotographicCategoryHero.tsx` |

**Lock conflict resolution:** the 9.2 brief Section 6.7 says "find via audit, the `HeroMedia` component or its wrapper" (the "or its wrapper" phrase explicitly authorises modifying the template wrappers). Section 7.1 lists "The HeroMedia component" but the spirit, taken with the "or its wrapper" hedge, authorises the gradient fix wherever it lives. Section 7.3 inherits the 9.1 lock on `PhotographicCultureHero` / `PhotographicCityHero` but the 9.2 brief explicitly identifies the gradient strengthen as an in-scope item carried forward from 9.1 closure. Reading the two together, the explicit 9.2 directive overrides the inherited 9.1 lock for THIS specific edit.

**Verdict for scope item 7:** modify the mid-stop alpha in PhotographicCultureHero.tsx (0.45 to 0.65) and PhotographicCityHero.tsx (0.40 to 0.65). PhotographicCategoryHero is touched only if its mid-stop is also weak after inspection. The change is one-line per file; the lock-override is documented explicitly.

---

## Chip on `/cultures` and `/cities` cards

The "X events" / "Coming soon" chip is rendered inline inside `CultureTile` (`src/app/cultures/page.tsx:165-171`) and `CityTile` (`src/app/cities/page.tsx:166-172`):

```jsx
<p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent)]">
  {countLabel}
</p>
```

The chip is text only with no background; contrast is gold (`#E8B738`) directly on the card photograph, mediated by the existing card gradient overlay that the 9.1.1 closure measured at 3.8:1 worst-case (passes AA Large only).

**Verdict for scope item 8:** add a navy frosted-glass pill background to the chip (Option A from the 9.2 brief). This raises contrast above 4.5:1 by sitting the gold text on a guaranteed dark backdrop and removes the dependency on the underlying photograph's luminance. Implementation lives inline in the two page files; the lock exception in Section 7.3 of the 9.2 brief authorises this single-purpose edit.

---

## Existing email signup component

**No email signup exists in `src/components/features/home/`.** The directory listing is exactly: city-rail-section, cultural-picks-section, event-rail-section, featured-venues-section, home-hero, home-schema-jsonld, live-vibe-section, section-skeletons, surprise-me-button, surprise-me-modal, this-week-section, trust-badges-row.

**Verdict for scope item 5:** NEW component, not REBUILD.

### Email subscribers table

**No `email_subscribers` table exists** in `supabase/migrations/` or `src/types/database.ts`. The 9.2 brief Section 6.5 explicitly anticipates this: "On submit: server action stores email in Supabase email_subscribers table (verify table exists in audit; create stub action if not)".

**Verdict for the storage layer:** stub server action that validates the email, fires a Plausible event (`email_signup_submit_success`), and returns success to the user. The DB persistence ships in 9.2.1 alongside the migration. This is brief-authorised behaviour, not silent deferral.

---

## Plausible install state

**Plausible is NOT installed.** `src/app/layout.tsx` (the body bootstrap script) currently injects Plausible via a custom `<script>` tag built in JavaScript:

```js
var s=document.createElement('script');
s.src='https://plausible.io/js/pa-cvIbUzVB_8Lu2naP1u5Xo.js';
s.async=true;s.defer=true;
document.head.appendChild(s);
```

This is a tagged-events build (`pa-cvIbUzVB...js` is the Plausible custom script naming for tagged-events). The install IS effectively present but baked into the body bootstrap rather than via `<Script>` in the head. The brief Section 6.6 calls for `<Script defer data-domain="eventlinqs.com" src="https://plausible.io/js/script.tagged-events.js" strategy="afterInteractive" />`.

**Verdict for scope item 6:** the existing inline injection achieves the same network outcome but lacks the `data-domain` attribute (which Plausible uses to namespace events to the correct site). The cleanest remediation: replace the inline injection with the brief's `<Script>` element, set `data-domain="eventlinqs.com"`, keep `strategy="afterInteractive"`. This removes a quirk of the headless-detection bootstrap (Plausible was conditionally injected only for non-headless visitors) but the brief explicitly mandates always-on tracking for production analytics. Document the cleanup in the closure report.

The `trackEvent` helper at `src/lib/analytics/plausible.ts` already wraps `window.plausible(name, props)` correctly. Conversion events ship via:
- (a) `trackEvent('event_name', props)` calls in click handlers (existing pattern; see `header-search-overlay.tsx:86` `trackEvent('search_overlay_opened')`).
- (b) Class-based tagged events (`className="plausible-event-name=button_click"`) for static link surfaces. Both paths are supported by the tagged-events Plausible build.

---

## SnapRailScroller v2.0 + token + media architecture

- The 9.1 nav, 9.1.1 cultures/cities indices, and the existing rails all use `<SnapRailScroller />` (locked Rail Standard v2.0) for horizontal scrolling. The new bento grids do NOT need SnapRailScroller because they're CSS-grid based, not horizontal-scroll based. The new chip strip at H2 DOES need scroll-snap behaviour on mobile; will use a CSS `scroll-snap-type: x mandatory` container without involving the Rail Standard component.
- Brand hex `#0A1628` (navy) and `#D4A437` (gold) are referenced via CSS custom properties: `--color-navy-950` and `--brand-accent`. New components use these tokens, not literal hex strings, to match the rest of the system.
- Card images on the new bento grids use `EventCardMedia` from `@/components/media` (the existing variant-aware component for card-sized photography). Hero on the SplitStateHero uses `HeroMedia`.
- `HeroPresenceMarker` from `@/components/layout/hero-presence-marker` (locked 9.1) wraps next to any `<HeroMedia>` use; the new SplitStateHero mounts it.

---

## Verdict summary

| Scope item | Verdict |
|---|---|
| 1. Split-state 2-column hero | **REBUILD** (replace `home-hero.tsx`) |
| 2. Bento grid H8 - Trending | **REBUILD** (replace inline bento section in `page.tsx`) |
| 3. Bento grid H10 - Cultural Moments | **NET-NEW** |
| 4. Category chip strip H2 | **NET-NEW** |
| 5. Email signup panel H13 | **NET-NEW** (UI ships; storage stubbed pending email_subscribers migration in 9.2.1) |
| 6. Plausible install + conversion events | **REBUILD** (replace inline body-bootstrap injection with `<Script>` + add data-domain + wire conversion events on every CTA) |
| 7. Bright-hero gradient strengthen | **REBUILD** (PhotographicCultureHero + PhotographicCityHero mid-stop 0.45 to 0.65; lock-override documented above) |
| 8. Bright-hero chip contrast fix | **REBUILD** (chip element on /cultures and /cities cards gains a navy frosted-glass pill background; brief Section 7.3 lock exception authorises) |

Plus authorised additions:
- `src/components/features/home/split-state-hero.tsx`
- `src/components/features/home/trending-events-bento.tsx`
- `src/components/features/home/cultural-moments-bento.tsx`
- `src/components/features/home/category-chip-strip.tsx`
- `src/components/features/home/email-signup-panel.tsx`
- `src/lib/cultural-moments/calendar.ts`
- `src/lib/cultural-moments/get-moments-ahead.ts`
- `src/lib/events/get-trending.ts`
- `src/app/actions/email-subscribe.ts` (server action)
- `docs/PLAUSIBLE-EVENTS.md`
- DESIGN-SYSTEM Sections 6.14 (Bento), 6.15 (Chip Strip), 6.16 (Plausible event naming)

## Blockers / coordination

- **Email subscribers table missing**: handled by stubbed server action per brief authorisation. Migration owed in 9.2.1.
- **HeroPresence marker mount**: the new SplitStateHero will mount `<HeroPresenceMarker />` so the SiteHeader's State A transparent treatment activates correctly on the homepage.
- **Plausible bootstrap quirk**: existing injection only runs for non-headless visitors. The brief's `<Script>` install runs for all visitors. This is a deliberate change to align with the brief's tracking intent. Documented in the closure report.

## File:line citations for every reused pattern

- `src/lib/analytics/plausible.ts:25-29` - `trackEvent(name, props)` (used by every click handler that fires a Plausible event)
- `src/components/media/HeroMedia.tsx:68-119` - hero LCP layer (reused by SplitStateHero)
- `src/components/layout/hero-presence-marker.tsx` - reused unchanged
- `src/components/templates/PhotographicCultureHero.tsx:42-48` - existing gradient mid-stop targeted by scope item 7
- `src/app/cultures/page.tsx:165-171`, `src/app/cities/page.tsx:166-172` - chip text targeted by scope item 8
- `src/lib/cultures/data.ts` - `CULTURE_SLUGS` (used to wire chip strip "Cultural Communities" expandable)
- `src/lib/cities/data.ts` - `CitySlug` union (used for city links)
- `src/components/media/index.ts` - `EventCardMedia`, `HeroMedia`, `MEDIA_QUALITY`, `MEDIA_SIZES` (reused by all new components)

End of audit.
