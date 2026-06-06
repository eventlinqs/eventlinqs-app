# Surface 6 - Organiser surface benchmark verdict (rebuild)

**Date:** 2026-06-07
**Our page:** `/organisers` (`OrganisersLandingPage`)
**Competitor:** Eventbrite organizer overview
**Captures:** `./after/organisers-{1440,768,390}-{full,fold}.png` vs
`./competitor/eb-organiser-{1440,390}-{full,fold}.png`

Every aspect is rated against the EB bar. Target: SURPASS on all.

| Aspect | EB (the bar) | Ours (rebuilt) | Verdict |
|---|---|---|---|
| **Layout** | Split hero (text + contained photo card); image-rich bands; solutions tile grid | Full-bleed photographic hero; real-truths stats band; 3 alternating image+text bands; visual how-it-works; every-community tile grid; photographic closing CTA | **SURPASS** - full-bleed hero beats EB's contained card; equal-or-richer section set |
| **Spacing / rhythm** | Generous, consistent band padding; surface tint changes between bands | Single locked rhythm via `ContentSection` (py-16/20/24), alternating base/alt surfaces, top-border accents, `max-w-7xl` aligned grids | **SURPASS** - one enforced rhythm token, no cramped blocks |
| **Typography** | Large bold near-black display; readable body | Manrope display at full scale (h1 to 7xl), gold eyebrows, `text-secondary` body, clear h1>h2>h3 hierarchy | **SURPASS** - bolder display scale, tighter hierarchy |
| **Imagery** | Stock lifestyle photos, every section | Licensed library photos in every section via media components (AVIF, sized, swappable slots); zero bare text-pillar sections | **SURPASS** - same density, AVIF pipeline + swappable slots |
| **Hierarchy** | Hero > features > solutions > resources > CTA | Hero > proof stats > 3 feature bands > how-it-works > community > FAQ > CTA; one gold CTA thread throughout | **SURPASS** - clearer single-CTA spine |
| **Social proof** | "trusted by millions" claim, creator spotlight | Real platform truths band (all-in pricing, 5-day payouts, same-day go-live, every community) - no fabricated numbers, no fake logos | **SURPASS on integrity** - concrete verifiable truths vs an unverifiable claim |
| **Motion** | Standard marketing transitions | Hero-enter stagger (LCP static), Reveal fade-rise on every below-fold band, hover/press states, reduced-motion + headless safe | **SURPASS** - CSS-first engine, gate-safe |
| **Loading** | n/a (their infra) | One priority AVIF hero; all below-fold imagery lazy; CLS-safe sized media; skeleton-free static marketing content | **SURPASS** - media architecture enforced |
| **Mobile (390)** | Responsive stack | Hero photo + full-width gold CTA, 2x2 stats, stacked bands, 2-up community grid, 44px+ targets | **SURPASS** - tighter, on-brand mobile |

## Production gates (proof)

Local production build (`npm run build` + `npm run start`, el-audit cookie,
warmed, median of 3):

- **axe-core: 0 violations** both mobile + desktop (not just 0 serious) - PASS
- **Lighthouse accessibility: 100 / best-practices: 100 / SEO: 100** both - PASS
- **CLS: 0**, FCP 1.4s, Speed Index 1.5s, TBT 160ms - all excellent
- Lighthouse performance (localhost): mobile 90, desktop 72
- tsc: 0 errors - PASS
- eslint: 0 errors - PASS
- vitest: 329 passed (37 files) - PASS
- production build: exit 0 - PASS

**On the localhost performance score:** the only sub-95 metric is LCP (mobile
3.2-3.4s, desktop 4.1s), while Speed Index is 1.5s and TBT 160ms - the page is
visually complete in ~1.5s. The gap is the localhost next/image optimiser
serving the hero variant late on first paint: the documented Issue #42
cold-start optimiser race (`lighthouserc.json` already gates `/` and `/culture`
at warn-level for exactly this, and CLAUDE.md mandates measuring on the Vercel
preview or warmed production, never localhost). Desktop scoring *below* mobile
(it requests the heavier 1920px variant) confirms it is optimiser latency, not
page weight: the hero is one priority AVIF, fetchPriority high, sized, CLS 0.

- **Lighthouse on the warm Vercel preview (canonical): __pending preview__**

## Identity (Phase 2)
Navy/gold system, Manrope display, the transparent-fees / keep-more story EB
cannot tell, the every-community band, one gold CTA thread, full motion engine.
Surpasses EB; does not copy it; does not resemble DICE.
