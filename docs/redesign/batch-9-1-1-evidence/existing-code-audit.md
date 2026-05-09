# Batch 9.1.1 GATE 2 - Existing Code Audit

Date: 2026-05-09
Branch: redesign/world-class-rebuild-2026-05-03
HEAD: ba22074

---

## Routes audit

| Route | Path | Exists? | Verdict |
|---|---|---|---|
| `/cultures` | `src/app/cultures/page.tsx` | False | NET-NEW |
| `/cities` | `src/app/cities/page.tsx` | False | NET-NEW |
| `/account` | `src/app/account/page.tsx` | False | NET-NEW (minimal stub) |
| `/culture/[culture]` | `src/app/culture/[culture]/page.tsx` | True | reused as link target only |
| `/city/[slug]` | `src/app/city/[slug]/page.tsx` | True | reused as link target only |

---

## Existing patterns audit (PRESERVE candidates)

### `/culture/[culture]` page pattern

`src/app/culture/[culture]/page.tsx:1-80` shows the established pattern:

- Server component with `revalidate = 300` ISR matching the rest of the public surface
- `generateStaticParams()` returns `getAllCultures().map(c => ({ culture: c.slug }))`
- `generateMetadata()` builds title/description/canonical/OG from the `CultureContent` row
- Composes `<CultureLandingPage>` (template) which wraps `<PhotographicCultureHero>` plus rails
- Public Supabase client via `createPublicClient()` (no auth needed for read-only event counts)

The new `/cultures` index page will mirror this pattern: server component, ISR revalidate, generateMetadata, public Supabase client for event counts.

### `/city/[slug]` page pattern

Same shape as culture: server component, ISR, generateMetadata, public Supabase client. New `/cities` index page mirrors.

### Cultures data layer

`src/lib/cultures/data.ts:17-31` defines `CultureSlug` as the union of exactly the 14 slugs the brief specifies, with the same Tier 1/Tier 2 split:

- Tier 1 (10): african, south-asian, caribbean, latin, east-asian, filipino, mediterranean, middle-eastern, european, pacific
- Tier 2 (4): gospel, comedy, wellness, pride

The data file exports `getAllCultures()`, `getCulture(slug)`, `isCultureSlug(slug)`. The `CultureContent` interface (`data.ts:40-62`) carries `slug, displayName, tier, tagline, heroHeadline, heroBody, ...`. Both the displayName ("African", "South Asian", "Gospel" etc) and tier are directly usable by the new index page card grid.

**Note on Tier 2 labels:** the brief calls Tier 2 entries "Pride & Inclusion, Gospel & Worship, Comedy, Wellness & Spirituality". The data uses the simpler `displayName` ("Pride", "Gospel", "Comedy", "Wellness"). The brief's longer labels are descriptive copy for the card grid; the dynamic route slugs and the `displayName` field are the source of truth for slugs and short identity. To stay consistent with the rest of the platform (rails, breadcrumbs, intersection editorials all use the short displayName), the index page will display the short displayName as the card title, with the longer brief-label rendered as the subtitle/tagline override only on the index card. No data-layer change required.

### Cities data layer

`src/lib/cities/data.ts:18-23` defines `CitySlug` as the union of exactly the 20 slugs the brief specifies:

- Tier 1 / Capital (8): sydney, melbourne, brisbane, perth, adelaide, gold-coast, canberra, hobart
- Tier 2 / Regional (12): newcastle, wollongong, geelong, townsville, cairns, darwin, sunshine-coast, bendigo, ballarat, albury, launceston, toowoomba

Exports `getAllCities()`, `getCity(slug)`, `isCitySlug(slug)`. The `CityContent` interface carries `slug, name, state, region, tier, population, latitude, longitude, descriptor, editorial, ...`. The `tier` and `name` fields are exactly what the new index page needs.

### Hero photo pipeline

`src/lib/images/culture-photo.ts` exports `getCultureHeroPhoto(slug)` which returns a Pexels URL or null. The function is `unstable_cache`-wrapped with a 7-day TTL and a `pexels-culture` cache tag.

`src/lib/images/city-photo.ts` exports `getCityHeroPhoto(slug)` and `getCityPhoto(slug)` (same pattern, portrait orientation for tile aspect, with city-name + landmark queries).

The new index page card grids will fetch one image per culture/city via these existing helpers. Server-side, in parallel, with the existing 7-day Pexels cache.

### `PhotographicCultureHero` component

`src/components/templates/PhotographicCultureHero.tsx:21-68`:
- Props: `eyebrow, title, subtitle, imageSrc`
- Locked layout: 48vh hero band, 320-460px height clamp, navy gradient overlay, left-anchored content stack at max-w-7xl
- Already includes `<HeroPresenceMarker />` (added in 9.1)

**Verdict: PRESERVE and reuse as-is for the `/cultures` page hero.** It is locked per Section 7.3 of the 9.1.1 brief (DO NOT TOUCH list).

### `PhotographicCityHero` component

Same pattern as PhotographicCultureHero. **Verdict: PRESERVE and reuse for `/cities` page hero.**

### SiteHeader server wrapper

`src/components/layout/site-header.tsx:15-18`:
```ts
export async function SiteHeader() {
  const cities = await getPickerCities()
  return <SiteHeaderClient location={MELBOURNE_FALLBACK} cities={cities} />
}
```

**Verdict: REBUILD (small additive).** Add `const supabase = await createClient()` from `@/lib/supabase/server`, await `supabase.auth.getUser()`, derive a small user identity object (initials, displayName), pass as new `user` prop. The client component then conditionally renders avatar vs sign-in CTAs.

### SiteHeaderClient

`src/components/layout/site-header-client.tsx:14-16` defines `NAV_LINKS`:
```ts
const NAV_LINKS = [
  { label: 'Browse Events', href: '/events' },
  { label: 'For Organisers', href: '/organisers' },
]
```

Lines 207-213 render the desktop "Sign in" link + "Get Started" button. Lines 326-330 render the mobile drawer "Get Started" + "Sign in" buttons.

**Verdict: REBUILD (focused).** Update NAV_LINKS to 4 items; conditionally render `<SiteHeaderAccountButton user={user} />` in place of the desktop Sign-in/Get-Started block when `user` is non-null; same conditional in mobile drawer.

### Supabase server client

`src/lib/supabase/server.ts` exports an async `createClient()` that wraps `@supabase/ssr` with the cookie store. **Verdict: PRESERVE and reuse.**

---

## Search overlay audit

`src/components/layout/header-search-overlay.tsx`:

| Capability | Current state | Verdict |
|---|---|---|
| `role="dialog"` + `aria-modal="true"` | Implemented (lines 140-141) | PRESERVE |
| `aria-label` on dialog | Implemented (line 142) | PRESERVE |
| Focus trap (Tab/Shift+Tab) | Implemented (lines 106-122) | PRESERVE |
| Body scroll lock | Implemented (lines 84-93) | PRESERVE |
| Initial input focus on open | Implemented (line 89) | PRESERVE |
| Escape closes overlay | Implemented (lines 96-103) | PRESERVE (extend) |
| **Focus restore to trigger on close** | NOT implemented; `onClose()` does not restore focus | REBUILD (NET-NEW behaviour) |
| **ArrowUp/Down navigation between suggestions** | NOT implemented; suggestions reachable via Tab only | REBUILD (NET-NEW behaviour) |
| **`aria-activedescendant` on input** | NOT implemented | REBUILD (NET-NEW behaviour) |
| **Home/End to first/last suggestion** | NOT implemented | REBUILD (NET-NEW behaviour) |
| **Enter activates highlighted suggestion** | Partial (Enter on input submits form; suggestions Tab-reachable) | REBUILD (NET-NEW behaviour) |

The trigger that opens the overlay lives in `src/components/layout/header-search-trigger.tsx`. It owns the `open` state and calls `setOpen(true)` on click, plus a global `/` keyboard handler. It is on the 9.1.1 DO NOT TOUCH list except for the focus-restore touchpoint. To restore focus to the trigger on close cleanly, the trigger button needs a stable ref accessible at the moment the overlay closes. Two clean options:

- **Option A (preferred):** capture `document.activeElement` at the moment the overlay opens (i.e. inside the overlay's open `useEffect`), store it as a `useRef`. On close, restore focus to that captured element. This is fully self-contained inside `header-search-overlay.tsx`, no touchpoint on the trigger file.
- Option B: add a triggerRef prop on the overlay and pass it down from header-search-trigger.

Going with Option A - zero touchpoints on the locked trigger file.

---

## Token + system audit

- **Typography:** all card titles use `font-display` (Manrope) with the existing weight/tracking matching `/culture/[culture]` and `/city/[slug]` heroes. PRESERVE.
- **Colour values:** brand `#0A1628` navy and `#D4A437` gold available as CSS custom properties (`--color-navy-950`, `--brand-accent` resolving to gold-400 = `#E8B738` per the design system; the brief's gold is `#D4A437` which is closer to `--color-gold-500` = `#D4A017`). The avatar shell uses 1px gold border which I'll source from `--brand-accent` to match the rest of the system. No new colour primitives needed.
- **Spacing tokens:** all containers use the locked 4px grid via Tailwind utilities. PRESERVE.
- **Media Architecture:** new card grids use `EventCardMedia` or a similar variant from `@/components/media`, never raw `<img>` or `next/image` directly. Per `docs/MEDIA-ARCHITECTURE.md`. The existing `/culture/[culture]` page uses `EventCardMedia` for sub-culture rail tiles; the new `/cultures` index will use the same component for the 14 cards.
- **Schema.org:** existing pages emit `Event` and `Place` JSON-LD. Adding `BreadcrumbList` + `ItemList` on the new index pages follows the same `<script type="application/ld+json">` server-rendered pattern in the page component.

---

## MobileBottomNav coexistence

`MobileBottomNav` (shipped Batch 9 V2, locked) renders Home / Browse / Search / Saved / Account on mobile. The new SiteHeader `Cultures` and `Cities` items live in the desktop nav and the mobile drawer (drawer is hidden by default behind the hamburger). MobileBottomNav already carries Search and Account; the new in-drawer Cultures/Cities does not duplicate these but adds the IA depth. No z-index conflict (drawer at z-50, bottom nav at z-40).

---

## Verdict summary

| Scope item | Verdict | Rationale |
|---|---|---|
| Nav taxonomy expansion (Browse/Cultures/Cities/For Organisers) | REBUILD | NAV_LINKS constant change + spacing verification |
| `/cultures` index page | NET-NEW | Route does not exist; data layer ready, hero component locked, image pipeline ready |
| `/cities` index page | NET-NEW | Same as cultures |
| `/account` route | NET-NEW (minimal stub) | Avatar click target must not 404 |
| Avatar shell authenticated state | NET-NEW | `<SiteHeaderAccountButton>` component + server-side `getUser()` in SiteHeader wrapper |
| Search overlay a11y fixes | REBUILD (focused) | 5 sub-features: focus restore, ArrowUp/Down, aria-activedescendant, Home/End, Enter-on-highlighted |
| Schema.org BreadcrumbList + ItemList on new pages | NET-NEW | Standard pattern, no data-layer change |
| HeroPresenceMarker on new pages | reuse | Locked component, drop in alongside HeroMedia |
| DESIGN-SYSTEM.md Section 6.13b | NET-NEW | Document AccountButton spec |

---

## Blockers / coordination

None. All authorised paths under Section 7.1 / 7.2 of the 9.1.1 brief. No DO NOT TOUCH file modification required. No schema change needed (event counts read from existing tables via existing helpers).
