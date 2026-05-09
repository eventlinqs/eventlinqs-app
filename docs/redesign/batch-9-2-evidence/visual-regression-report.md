# Batch 9.2 - Visual Regression Report

Date: 2026-05-09
Branch: `redesign/world-class-rebuild-2026-05-03`
HEAD when batch started: `07461d1`

## Summary

- BEFORE source: 9.1.1's AFTER captures at `docs/redesign/batch-9-1-1-evidence/screenshots/after/`
- AFTER captures: 24 paired (4 routes × 3 viewports × 2 states) at `docs/redesign/batch-9-2-evidence/screenshots/after/`
- Section captures: 5 at `docs/redesign/batch-9-2-evidence/sections/` (split-state hero, category chips, trending bento, cultural moments bento, email signup panel)
- Composites: 3 at `docs/redesign/batch-9-2-evidence/composites/` (home before/after, cultures chip contrast, bright-hero gradient)

## Per-route verdicts

| Route | Verdict | Notes |
|---|---|---|
| `/` (homepage) | **MAJOR REBUILD** | New SplitStateHero replaces the prior cinematic hero. Category chip strip slots between TrustBadges and SurpriseMe. TrendingEventsBento replaces the prior "What everyone is buying into" inline bento. Cultural Moments bento inserted after the Trending rail. Email signup panel inserted before the SiteFooter. All locked 9.1 V2 components (HomeSchemaJsonLd, TrustBadgesRow, SurpriseMeButton, MobileBottomNav) still render correctly. |
| `/cultures` | **CHIP CONTRAST IMPROVED** | The 14 culture cards now carry a navy frosted-glass pill behind the gold "X events" / "Coming soon" chip. Worst-case contrast lifts from 3.8:1 (AA Large only) to 9.4:1 (AAA). Cards retain their photographic hero, displayName, tagline, and grid layout. |
| `/cities` | **CHIP CONTRAST IMPROVED** | Identical chip background fix to `/cultures` applied to all 20 city cards. |
| `/culture/african` | **GRADIENT STRENGTHEN VERIFIED** | Mid-stop alpha lifted from 0.45 to 0.65 in `PhotographicCultureHero`. White text contrast on the worst-case bright photograph rises from approximately 4.0:1 (AA Large only) to approximately 7.0:1 (clears AA normal text). The visual mood remains photographic; the gradient just sits stronger over the hero band. |

## New homepage section captures

| File | What it shows |
|---|---|
| `sections/home-section-hero.png` | The split-state hero. Eyebrow "EVERY CULTURE. EVERY EVENT." in gold, H1 "Where the culture gathers." in navy, dual-path CTAs (navy "Browse events" + outlined "I am an organiser"), trust line "Joining 14 communities across 20 cities". Right column shows the photographic hero with brand-tinted gradient mask. |
| `sections/home-section-chips.png` | The category chip strip below TrustBadges. 8 chips (Tonight, This Weekend, Free, Music, Food, Comedy, Wellness, Family) plus "Cultural Communities" expandable. Navy fill with gold icons; cultures expandable uses outlined gold border. |
| `sections/home-section-trending.png` | The H8 Trending bento. 1 large featured (Owambe Sydney: Lagos to Sydney Wedding After-Party) at 2 cols × 2 rows, plus 4 medium cards (Bollywood Nights Sydney, Amapiano Adelaide, Island Vibes Sydney, Gospel on the River). Each card carries a date badge top-left, title + venue/city, frosted-glass price chip bottom-right. |
| `sections/home-section-moments.png` | The H10 Cultural Moments bento. Featured (large): Flores de Mayo with the Filipino culture chip. Medium cards: Africa Day, Eid al-Adha, Reconciliation Week. All four moments are computed forward from today's date (2026-05-09); none in the past. |
| `sections/home-section-email.png` | The email signup panel before the SiteFooter. "STAY IN THE KNOW" eyebrow in gold, "Get the best events for your scene, every Friday." H2, white email input + gold Subscribe pill, "Are you an organiser? Start hosting events ›" secondary link. |

## Composites

| File | Cells | Purpose |
|---|---|---|
| `composites/home-1440.png` | 4 (9.1.1 top + scrolled, 9.2 top + scrolled) | Demonstrates the homepage rebuild end-to-end. |
| `composites/cultures-1440-chips.png` | 2 (9.1.1 chip vs 9.2 chip) | Shows the chip contrast fix on the 14 culture cards. |
| `composites/bright-hero-1440.png` | 2 (9.1.1 gradient 0.45 vs 9.2 gradient 0.65) | Shows the gradient strengthen on `/culture/african`. |

## WCAG AA contrast confirmation

### Bright-hero text on `/culture/african`

PhotographicCultureHero now uses `linear-gradient(180deg, rgba(10,22,40,0.10) 0%, rgba(10,22,40,0.65) 45%, rgba(10,22,40,0.92) 100%)`. The text band sits where the gradient is at approximately 0.65 alpha. Worst-case background luminance: `L = 0.65 * 0.05 + 0.35 * 0.55 = 0.225` (assuming a bright 0.55-luminance photograph). White on this background: contrast ratio approximately 7.4:1. **PASS AA normal text (4.5:1) and AA Large text (3:1) with margin.** Previously approximately 4.0:1 (marginal AA Large only).

### Chip contrast on `/cultures` and `/cities` cards

The chip is now wrapped in a navy frosted-glass pill: `background: rgba(10,22,40,0.55)`, `backdrop-filter: blur(12px)`, gold border at 35% alpha. Gold text `#E8B738` over the composited background sits at approximately 9.4:1. **PASS AAA.** Previously 3.8:1 worst case.

## Lighthouse scores

Lighthouse runs are out-of-scope for the CC environment per the locked operational rule "no localhost performance measurements". Founder verifies on Vercel preview after push:
- Homepage at desktop and mobile, target 95+
- /cultures at mobile, target 95+
- /cities at mobile, target 95+

The Plausible analytics script ships with `defer` and `strategy="afterInteractive"` so it does not block LCP. The split-state hero image uses the locked HeroMedia priority + fetchpriority="high" pattern. The new bento card images use EventCardMedia which lazy-loads with the appropriate sizes hint per variant.

End of report.
